require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const FileStoreFactory = require('session-file-store');
const { ensureFile, readJson, hasDatabase, ensurePgReady } = require('../utils/fsdb');
const { PgSessionStore } = require('../utils/sessionStore');
const { createCsrfToken, safeEqual } = require('../utils/security');

const authRoutes = require('../routes/auth');
const lessonRoutes = require('../routes/lessons');
const accessRoutes = require('../routes/access');
const adminRoutes = require('../routes/admin');
const paymentRoutes = require('../routes/payments');

const app = express();
const FileStore = FileStoreFactory(session);

const PORT = Number(process.env.PORT) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).trim();
const APP_NAME = (process.env.APP_NAME || 'Level Up English').trim();

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const LESSONS_FILE = path.join(__dirname, '..', 'data', 'lessons.json');
const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'settings.json');
const LOGS_FILE = path.join(__dirname, '..', 'data', 'logs.json');
const SESSION_DIR = path.join(__dirname, '..', '.sessions');

function validateEnv() {
  const errors = [];

  try {
    new URL(APP_URL);
  } catch (_error) {
    errors.push('APP_URL is invalid.');
  }

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim().length < 24) {
    errors.push('SESSION_SECRET must be at least 24 characters.');
  }

  if (IS_PROD && APP_URL.startsWith('http://')) {
    errors.push('APP_URL must use https in production.');
  }

  if (IS_PROD && process.env.SESSION_SECRET === 'development-session-secret') {
    errors.push('SESSION_SECRET cannot use the development value in production.');
  }

  if (IS_PROD && !process.env.DATABASE_URL) {
    errors.push('DATABASE_URL should be configured in production.');
  }

  if (IS_PROD && !process.env.ADMIN_PASSWORD_HASH && (!process.env.ADMIN_KEY || process.env.ADMIN_KEY.trim().length < 12)) {
    errors.push('Configure ADMIN_PASSWORD_HASH or a strong ADMIN_KEY in production.');
  }

  if (errors.length) {
    const message = `Environment validation failed:\n- ${errors.join('\n- ')}`;
    throw new Error(message);
  }
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter(options) {
  const { windowMs, max, message, keyGenerator = (req) => `${getClientIp(req)}:${req.path}`, skip = () => false } = options;
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    if (skip(req)) return next();

    const now = Date.now();
    const key = keyGenerator(req);
    const current = hits.get(key);

    if (!current || current.expiresAt <= now) {
      hits.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    current.count += 1;
    hits.set(key, current);

    if (current.count > max) {
      const retryAfterSeconds = Math.ceil((current.expiresAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ error: message || 'Too many requests. Please try again later.' });
    }

    return next();
  };
}

function attachSecurityMiddleware() {
  if (IS_PROD) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        mediaSrc: ["'self'", 'blob:'],
      },
    },
  }));

  app.use(compression());
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
    next();
  });

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 30 }));
}

function attachRateLimits() {
  const generalLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: 'Too many requests. Please slow down.',
    keyGenerator: (req) => `general:${getClientIp(req)}`,
    skip: (req) => (
      req.path.startsWith('/assets/') ||
      req.path.endsWith('.css') ||
      req.path.endsWith('.js') ||
      req.path.endsWith('.png') ||
      req.path.endsWith('.jpg') ||
      req.path.endsWith('.jpeg') ||
      req.path.endsWith('.svg') ||
      req.path.endsWith('.webp')
    ),
  });

  const authLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 25,
    message: 'Too many auth attempts. Please wait and try again.',
    keyGenerator: (req) => `auth:${getClientIp(req)}:${req.path}`,
  });

  const adminLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many admin requests. Please wait and try again.',
    keyGenerator: (req) => `admin:${getClientIp(req)}:${req.path}`,
  });

  app.use(generalLimiter);
  app.use('/api/auth', authLimiter);
  app.use('/api/admin', adminLimiter);
}

function attachSession() {
  const store = hasDatabase() ? new PgSessionStore() : new FileStore({
      path: SESSION_DIR,
      retries: 1,
      reapInterval: 60 * 60,
      logFn: () => {},
    });

  if (hasDatabase()) {
    setInterval(() => {
      store.clearExpired?.().catch?.(() => {});
    }, 60 * 60 * 1000).unref();
  }

  app.use(session({
    name: 'levelup.sid',
    secret: process.env.SESSION_SECRET.trim(),
    resave: false,
    rolling: true,
    saveUninitialized: false,
    proxy: IS_PROD,
    store,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: 'strict',
      secure: IS_PROD,
    },
  }));

  app.use((req, _res, next) => {
    if (req.session) {
      req.session.cookie.sameSite = 'strict';
      req.session.cookie.httpOnly = true;
      req.session.cookie.secure = IS_PROD;
      if (!req.session.csrfToken) {
        req.session.csrfToken = createCsrfToken();
      }
    }
    next();
  });
}

function attachRequestProtection() {
  app.get('/api/csrf', (req, res) => {
    if (!req.session.csrfToken) req.session.csrfToken = createCsrfToken();
    return res.json({ csrfToken: req.session.csrfToken });
  });

  app.use((req, res, next) => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next();

    const origin = req.headers.origin;
    if (origin) {
      const expectedOrigin = new URL(APP_URL).origin;
      if (origin !== expectedOrigin) {
        return res.status(403).json({ error: 'Blocked request origin.' });
      }
    }

    if (!req.session || !req.session.csrfToken) {
      return res.status(403).json({ error: 'Missing CSRF session.' });
    }

    const headerToken = String(req.headers['x-csrf-token'] || '');
    if (!safeEqual(headerToken, req.session.csrfToken)) {
      return res.status(403).json({ error: 'Invalid CSRF token.' });
    }

    return next();
  });
}

function attachMetaRoutes() {
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, app: APP_NAME, env: NODE_ENV });
  });

  app.get('/api/meta', async (_req, res, next) => {
    try {
      const settings = await readJson(SETTINGS_FILE, {});
      res.json({
        appName: process.env.APP_NAME || settings.appName || 'Level Up English',
        coursePrice: process.env.COURSE_PRICE || settings.coursePrice || '199000',
        telegramUsername: process.env.TELEGRAM_USERNAME || settings.telegramUsername || 'levelupfayzullo',
        freeLessonCount: settings.freeLessonCount || 1,
        passPercent: settings.passPercent || 80,
        totalLessons: settings.totalLessons || 30,
      });
    } catch (error) {
      next(error);
    }
  });
}

function attachRoutes() {
  app.use('/api/auth', authRoutes);
  app.use('/api/lessons', lessonRoutes);
  app.use('/api/access', accessRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/payments', paymentRoutes);

  app.use(express.static(path.join(__dirname, '..', 'public'), {
    extensions: ['html'],
    etag: true,
    maxAge: IS_PROD ? '1d' : 0,
  }));

  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
  });

  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found.' });
    }
    return res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });
}

function attachErrorHandlers() {
  app.use((error, _req, res, next) => {
    if (error instanceof SyntaxError && 'body' in error) {
      return res.status(400).json({ error: 'Invalid JSON payload.' });
    }
    return next(error);
  });

  app.use((error, req, res, _next) => {
    const status = error.status || 500;
    console.error('[SERVER ERROR]', {
      path: req.path,
      method: req.method,
      ip: getClientIp(req),
      message: error.message,
      stack: IS_PROD ? undefined : error.stack,
    });

    if (req.path.startsWith('/api/')) {
      return res.status(status).json({ error: status === 500 ? 'Internal server error.' : error.message });
    }

    return res.status(status).send(status === 500 ? 'Internal server error.' : error.message);
  });
}

async function bootstrap() {
  validateEnv();

  await ensureFile(USERS_FILE, []);
  await ensureFile(LESSONS_FILE, []);
  await ensureFile(SETTINGS_FILE, {
    appName: APP_NAME,
    coursePrice: '29000',
    telegramUsername: 'levelupfayzullo',
    freeLessonCount: 1,
    passPercent: 80,
    totalLessons: 30,
  });
  await ensureFile(LOGS_FILE, []);
  await ensureFile(path.join(__dirname, '..', 'data', 'payment-requests.json'), []);
  if (hasDatabase()) await ensurePgReady();

  attachSecurityMiddleware();
  attachRateLimits();
  attachSession();
  attachRequestProtection();
  attachMetaRoutes();
  attachRoutes();
  attachErrorHandlers();

  app.listen(PORT, () => {
    console.log(`Server running on ${APP_URL}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error.message);
  process.exit(1);
});
