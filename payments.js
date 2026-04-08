const express = require('express');
const { createPaymentRequest } = require('../services/paymentService');
const { getUserById } = require('../services/userService');

const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first.' });
  return next();
}

router.post('/request', requireAuth, async (req, res, next) => {
  try {
    const user = await getUserById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (!user.completedLesson1) return res.status(400).json({ error: 'Complete Lesson 1 first.' });
    const { transactionId, amount, note } = req.body || {};
    if (!String(transactionId || '').trim()) return res.status(400).json({ error: 'Transaction ID is required.' });
    const request = await createPaymentRequest({ user, transactionId, amount, note });
    return res.json({ ok: true, request, message: 'Payment request sent for admin review.' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
