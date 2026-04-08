const express = require('express');
const {
  getAllUsers,
  getUserById,
  setPaidStatus,
  approveUserAccess,
  revokeUserAccess,
  regenerateAccessCode,
  revealAccessCode,
} = require('../services/userService');
const { getLogs, addLog } = require('../services/auditService');
const { getPaymentRequests, reviewPaymentRequest } = require('../services/paymentService');
const { safeEqual, comparePassword, verifyTotp } = require('../utils/security');

const router = express.Router();
const ADMIN_SESSION_KEY = 'isAdmin';
const ADMIN_LOGIN_TRACKER = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function getAdminConfig() {
  const username = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim();
  const fallbackKey = String(process.env.ADMIN_KEY || '').trim();
  const totpSecret = String(process.env.ADMIN_TOTP_SECRET || '').trim();
  if (!passwordHash && fallbackKey.length < 12) {
    const error = new Error('Configure ADMIN_PASSWORD_HASH (recommended) or a strong ADMIN_KEY.');
    error.status = 500;
    throw error;
  }
  return { username, passwordHash, fallbackKey, totpSecret };
}

function cleanUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone || '',
    paid: Boolean(user.paid),
    accessApproved: Boolean(user.accessApproved),
    accessUnlocked: Boolean(user.accessUnlocked),
    accessCodeMasked: user.accessCodeMasked || null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    unlockedAt: user.unlockedAt || null,
    approvedAt: user.approvedAt || null,
    paymentRequestedAt: user.paymentRequestedAt || null,
    completedLesson1: Boolean(user.completedLesson1),
    progress: user.progress && typeof user.progress === 'object' ? user.progress : {},
    progressCount: Object.values(user.progress || {}).filter((item) => item?.passed).length,
  };
}

function parseId(value) {
  const id = String(value || '').trim();
  if (!id) {
    const error = new Error('Invalid id.');
    error.status = 400;
    throw error;
  }
  return id;
}

function requireJsonBody(req, _res, next) {
  if (!req.is('application/json')) {
    const error = new Error('Content-Type must be application/json.');
    error.status = 415;
    return next(error);
  }
  return next();
}

function requireAdminSession(req, _res, next) {
  if (!req.session || req.session[ADMIN_SESSION_KEY] !== true) {
    const error = new Error('Admin authentication required.');
    error.status = 401;
    return next(error);
  }
  return next();
}

function trackAdminLogin(req) {
  const ip = getClientIp(req);
  const current = ADMIN_LOGIN_TRACKER.get(ip);
  const now = Date.now();
  if (!current || current.expiresAt <= now) {
    const fresh = { count: 1, expiresAt: now + (15 * 60 * 1000) };
    ADMIN_LOGIN_TRACKER.set(ip, fresh);
    return fresh;
  }
  current.count += 1;
  ADMIN_LOGIN_TRACKER.set(ip, current);
  return current;
}

function clearAdminLoginTracker(req) { ADMIN_LOGIN_TRACKER.delete(getClientIp(req)); }

function rejectIfTooManyAdminAttempts(req) {
  const current = ADMIN_LOGIN_TRACKER.get(getClientIp(req));
  const now = Date.now();
  if (current && current.expiresAt > now && current.count >= 8) {
    const error = new Error('Too many failed admin login attempts. Please wait and try again.');
    error.status = 429;
    throw error;
  }
}

async function loadUsersForAdmin() {
  const users = await getAllUsers();
  const clean = users.map(cleanUser);
  const stats = {
    totalUsers: clean.length,
    paidUsers: clean.filter((u) => u.paid).length,
    unlockedUsers: clean.filter((u) => u.accessUnlocked).length,
    approvedUsers: clean.filter((u) => u.accessApproved).length,
    lesson1Completed: clean.filter((u) => u.completedLesson1).length,
    waitingForPaymentReview: clean.filter((u) => u.completedLesson1 && !u.paid).length,
  };
  return { users: clean, stats };
}

router.post('/login', requireJsonBody, async (req, res, next) => {
  try {
    rejectIfTooManyAdminAttempts(req);
    const { username, passwordHash, fallbackKey, totpSecret } = getAdminConfig();
    const submittedUsername = String(req.body?.username || '').trim().toLowerCase();
    const submittedPassword = String(req.body?.password || '').trim();
    const submittedKey = String(req.body?.key || '').trim();
    const submittedTotp = String(req.body?.totp || '').trim();

    let valid = false;
    if (passwordHash) {
      valid = submittedUsername === username && await comparePassword(submittedPassword, passwordHash);
    } else if (fallbackKey) {
      valid = safeEqual(submittedKey, fallbackKey);
    }

    if (!valid || !verifyTotp(totpSecret, submittedTotp)) {
      trackAdminLogin(req);
      const error = new Error('Invalid admin credentials.');
      error.status = 401;
      throw error;
    }

    clearAdminLoginTracker(req);
    await regenerateSession(req);
    req.session[ADMIN_SESSION_KEY] = true;
    req.session.adminUsername = username;
    req.session.adminLoggedInAt = new Date().toISOString();
    await addLog('admin_login_success', { adminUsername: username, ip: getClientIp(req) });
    return res.json({ ok: true, message: 'Admin login successful.' });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', requireAdminSession, async (req, res, next) => {
  try {
    const adminUsername = req.session.adminUsername || 'admin';
    req.session.destroy(async (destroyError) => {
      if (destroyError) return next(destroyError);
      await addLog('admin_logout', { adminUsername });
      res.clearCookie('levelup.sid');
      return res.json({ ok: true, message: 'Admin logged out.' });
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/session', async (req, res) => res.json({ ok: true, isAdmin: Boolean(req.session && req.session[ADMIN_SESSION_KEY] === true) }));
router.get('/users', requireAdminSession, async (_req, res, next) => {
  try { return res.json({ ok: true, ...(await loadUsersForAdmin()) }); } catch (error) { return next(error); }
});
router.get('/users/export.csv', requireAdminSession, async (_req, res, next) => {
  try {
    const { users } = await loadUsersForAdmin();
    const header = ['id', 'fullName', 'email', 'phone', 'paid', 'accessApproved', 'accessUnlocked', 'completedLesson1', 'progressCount', 'createdAt'];
    const rows = users.map((u) => header.map((key) => `"${String(u[key] ?? '').replaceAll('"', '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="levelup-users.csv"');
    return res.send([header.join(','), ...rows].join('\n'));
  } catch (error) { return next(error); }
});
router.get('/logs', requireAdminSession, async (_req, res, next) => {
  try { return res.json({ ok: true, logs: await getLogs() }); } catch (error) { return next(error); }
});
router.get('/payments', requireAdminSession, async (_req, res, next) => {
  try { return res.json({ ok: true, payments: await getPaymentRequests() }); } catch (error) { return next(error); }
});
router.post('/payments/:id/approve', requireAdminSession, requireJsonBody, async (req, res, next) => {
  try {
    const requestId = parseId(req.params.id);
    const reviewed = await reviewPaymentRequest(requestId, { status: 'approved', reviewedBy: req.session.adminUsername || 'admin' });
    if (!reviewed) return res.status(404).json({ ok: false, error: 'Payment request not found.' });
    const updated = await setPaidStatus(reviewed.userId, true);
    return res.json({ ok: true, payment: reviewed, user: cleanUser(updated), message: 'Payment approved and user marked as paid.' });
  } catch (error) { return next(error); }
});
router.post('/payments/:id/reject', requireAdminSession, requireJsonBody, async (req, res, next) => {
  try {
    const requestId = parseId(req.params.id);
    const reviewed = await reviewPaymentRequest(requestId, { status: 'rejected', reviewedBy: req.session.adminUsername || 'admin' });
    if (!reviewed) return res.status(404).json({ ok: false, error: 'Payment request not found.' });
    await setPaidStatus(reviewed.userId, false);
    return res.json({ ok: true, payment: reviewed, message: 'Payment request rejected.' });
  } catch (error) { return next(error); }
});
router.get('/users/:id', requireAdminSession, async (req, res, next) => {
  try {
    const user = await getUserById(parseId(req.params.id));
    if (!user) return res.status(404).json({ ok: false, error: 'User not found.' });
    return res.json({ ok: true, user: cleanUser(user) });
  } catch (error) { return next(error); }
});
router.post('/users/:id/mark-paid', requireAdminSession, requireJsonBody, async (req, res, next) => {
  try {
    const updated = await setPaidStatus(parseId(req.params.id), typeof req.body?.paid === 'boolean' ? req.body.paid : true);
    if (!updated) return res.status(404).json({ ok: false, error: 'User not found.' });
    return res.json({ ok: true, user: cleanUser(updated), message: updated.paid ? 'User marked as paid.' : 'User marked as unpaid.' });
  } catch (error) { return next(error); }
});
router.post('/users/:id/approve', requireAdminSession, requireJsonBody, async (req, res, next) => {
  try {
    const updated = await approveUserAccess(parseId(req.params.id));
    if (!updated) return res.status(404).json({ ok: false, error: 'User not found.' });
    return res.json({ ok: true, user: cleanUser(updated), message: 'User access approved.' });
  } catch (error) { return next(error); }
});
router.post('/users/:id/revoke', requireAdminSession, requireJsonBody, async (req, res, next) => {
  try {
    const updated = await revokeUserAccess(parseId(req.params.id));
    if (!updated) return res.status(404).json({ ok: false, error: 'User not found.' });
    return res.json({ ok: true, user: cleanUser(updated), message: 'User access revoked.' });
  } catch (error) { return next(error); }
});
router.post('/users/:id/regenerate-code', requireAdminSession, requireJsonBody, async (req, res, next) => {
  try {
    const updated = await regenerateAccessCode(parseId(req.params.id));
    return res.json({ ok: true, user: cleanUser(updated), message: 'Access code regenerated.' });
  } catch (error) { return next(error); }
});
router.post('/users/:id/reveal-code', requireAdminSession, requireJsonBody, async (req, res, next) => {
  try {
    const code = await revealAccessCode(parseId(req.params.id));
    if (!code) return res.status(404).json({ ok: false, error: 'User not found or code unavailable.' });
    return res.json({ ok: true, code });
  } catch (error) { return next(error); }
});

router.use((error, _req, res, _next) => res.status(error.status || 500).json({ ok: false, error: error.message || 'Admin request failed.' }));

module.exports = router;
