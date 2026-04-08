const express = require('express');
const { verifyAccessCode, getUserById } = require('../services/userService');
const { sanitizeUser } = require('../utils/security');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first.' });
  next();
}

router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { code } = req.body || {};
    const user = await verifyAccessCode(req.session.userId, code);
    return res.json({ message: 'Access unlocked successfully.', user: sanitizeUser(user) });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Access code verification failed.' });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  const user = await getUserById(req.session.userId);
  return res.json({
    accessUnlocked: Boolean(user?.accessUnlocked),
    isPaid: Boolean(user?.isPaid),
    isApproved: Boolean(user?.isApproved),
    completedLesson1: Boolean(user?.completedLesson1),
    paymentRequestedAt: user?.paymentRequestedAt || null,
  });
});

module.exports = router;
