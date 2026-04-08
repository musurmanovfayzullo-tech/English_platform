const express = require('express');
const { createUser, authenticateUser, getUserById } = require('../services/userService');
const { sanitizeUser } = require('../utils/security');
const { validateEmail, validateFullName, validatePassword, validatePhone } = require('../utils/validation');

const router = express.Router();
const LOGIN_TRACKER = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

function trackerKey(req, email = '') {
  return `${getClientIp(req)}:${String(email || '').trim().toLowerCase()}`;
}

function getTracker(req, email = '') {
  const key = trackerKey(req, email);
  const now = Date.now();
  const current = LOGIN_TRACKER.get(key);
  if (!current || current.expiresAt <= now) {
    const fresh = { count: 0, expiresAt: now + LOGIN_WINDOW_MS };
    LOGIN_TRACKER.set(key, fresh);
    return { key, state: fresh };
  }
  return { key, state: current };
}

function ensureBelowLimit(req, email = '') {
  const { state } = getTracker(req, email);
  const now = Date.now();
  if (state.count >= LOGIN_MAX_ATTEMPTS && state.expiresAt > now) {
    const error = new Error('Too many failed login attempts. Please wait and try again.');
    error.status = 429;
    error.retryAfter = Math.ceil((state.expiresAt - now) / 1000);
    throw error;
  }
}

function markFailure(req, email = '') {
  const { state } = getTracker(req, email);
  state.count += 1;
}

function clearFailures(req, email = '') {
  LOGIN_TRACKER.delete(trackerKey(req, email));
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

router.post('/register', async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body || {};

    const fullNameError = validateFullName(fullName);
    if (fullNameError) return res.status(400).json({ error: fullNameError });
    const emailError = validateEmail(email);
    if (emailError) return res.status(400).json({ error: emailError });
    const phoneError = validatePhone(phone);
    if (phoneError) return res.status(400).json({ error: phoneError });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const user = await createUser({ fullName, email, phone, password });
    await regenerateSession(req);
    req.session.userId = user.id;

    return res.status(201).json({ message: 'Registration successful.', user: sanitizeUser(user) });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Registration failed.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  try {
    const emailError = validateEmail(email);
    if (emailError || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    ensureBelowLimit(req, email);
    const user = await authenticateUser({ email, password });
    clearFailures(req, email);
    await regenerateSession(req);
    req.session.userId = user.id;

    return res.json({ message: 'Login successful.', user: sanitizeUser(user) });
  } catch (error) {
    markFailure(req, email);
    if (error.retryAfter) {
      res.set('Retry-After', String(error.retryAfter));
    }
    return res.status(error.status || 401).json({ error: error.message || 'Login failed.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('levelup.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await getUserById(req.session.userId);
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ user: null });
  }
  return res.json({ user: sanitizeUser(user) });
});

module.exports = router;
