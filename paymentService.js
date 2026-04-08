const path = require('path');
const crypto = require('crypto');
const { readJson, writeJson } = require('../utils/fsdb');
const { addLog } = require('./auditService');
const { sendTelegramMessage } = require('./telegramService');

const PAYMENTS_FILE = path.join(__dirname, '..', 'data', 'payment-requests.json');

async function getPaymentRequests() {
  const data = await readJson(PAYMENTS_FILE, []);
  return Array.isArray(data) ? data : [];
}

async function savePaymentRequests(items) {
  await writeJson(PAYMENTS_FILE, items);
  return items;
}

async function createPaymentRequest({ user, transactionId, amount, note }) {
  const list = await getPaymentRequests();
  const existingPending = list.find((item) => item.userId === user.id && item.status === 'pending');
  if (existingPending) throw new Error('You already have a pending payment request. Please wait for admin review.');

  const request = {
    id: crypto.randomUUID(),
    userId: user.id,
    transactionId: String(transactionId || '').trim(),
    amount: String(amount || '').trim(),
    note: String(note || '').trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
  };
  list.unshift(request);
  await savePaymentRequests(list);
  await addLog('payment_request_created', { userId: user.id, paymentRequestId: request.id, amount: request.amount });
  try {
    await sendTelegramMessage([
      '💸 New payment request',
      `👤 ${user.fullName}`,
      `📧 ${user.email}`,
      `🧾 Txn: ${request.transactionId || '-'}`,
      `💰 Amount: ${request.amount || '-'}`,
      `📝 Note: ${request.note || '-'}`,
      `🆔 Request ID: ${request.id}`,
    ].join('\n'));
  } catch (_error) {}
  return request;
}

async function reviewPaymentRequest(requestId, { status, reviewedBy }) {
  const list = await getPaymentRequests();
  const index = list.findIndex((item) => item.id === requestId);
  if (index === -1) return null;
  list[index] = {
    ...list[index],
    status,
    reviewedAt: new Date().toISOString(),
    reviewedBy,
  };
  await savePaymentRequests(list);
  await addLog(`payment_request_${status}`, { paymentRequestId: requestId, reviewedBy });
  return list[index];
}

async function getLatestPaymentForUser(userId) {
  const list = await getPaymentRequests();
  return list.find((item) => item.userId === userId) || null;
}

module.exports = {
  getPaymentRequests,
  createPaymentRequest,
  reviewPaymentRequest,
  getLatestPaymentForUser,
};
