const TELEGRAM_API = 'https://api.telegram.org';

async function sendTelegramMessage(text) {
  const token = process.env.BOT_TOKEN;
  const chatId = process.env.CHAT_ID;

  if (!token || !chatId) {
    return { skipped: true, reason: 'BOT_TOKEN or CHAT_ID missing' };
  }

  const response = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram send failed: ${errorText}`);
  }

  return response.json();
}

async function sendAccessCodeMessage({ fullName, email, phone, accessCode }) {
  return sendTelegramMessage([
    '🆕 New user registered',
    `👤 ${fullName}`,
    `📧 ${email}`,
    `📱 ${phone || '-'}`,
    `🔑 Code: ${accessCode}`,
  ].join('\n'));
}

async function sendPaymentRequestMessage({ fullName, email, phone, lessonId, bestPercent }) {
  return sendTelegramMessage([
    '💳 Payment request ready',
    `👤 ${fullName}`,
    `📧 ${email}`,
    `📱 ${phone || '-'}`,
    `📘 Passed lesson: ${lessonId}`,
    `📈 Best score: ${bestPercent}%`,
    'Action: verify payment, mark user as paid, approve access, then share code.',
  ].join('\n'));
}

async function sendAccessApprovedMessage({ fullName, email, accessCode }) {
  return sendTelegramMessage([
    '✅ Access approved by admin',
    `👤 ${fullName}`,
    `📧 ${email}`,
    `🔑 Code ready: ${accessCode}`,
  ].join('\n'));
}

module.exports = {
  sendTelegramMessage,
  sendAccessCodeMessage,
  sendPaymentRequestMessage,
  sendAccessApprovedMessage,
};
