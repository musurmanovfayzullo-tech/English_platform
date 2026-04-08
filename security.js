const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function hashPassword(password) {
  return bcrypt.hash(String(password || ''), BCRYPT_ROUNDS);
}

async function comparePassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(String(password || ''), String(hash));
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function sanitizeUser(user) {
  if (!user) return null;
  const {
    passwordHash,
    accessCode,
    accessCodeMasked,
    ...rest
  } = user;

  return {
    ...rest,
    accessCodeMasked: accessCodeMasked || null,
  };
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function generateTotp(secret, timeStep = 30, digits = 6, timestamp = Date.now()) {
  const normalized = String(secret || '').replace(/\s+/g, '').toUpperCase();
  if (!normalized) return '';
  const key = Buffer.from(normalized, 'base64');
  const counter = Math.floor(timestamp / 1000 / timeStep);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % (10 ** digits)).padStart(digits, '0');
}

function verifyTotp(secret, token, { window = 1 } = {}) {
  const value = String(token || '').trim();
  if (!secret) return true;
  if (!/^\d{6}$/.test(value)) return false;
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = generateTotp(secret, 30, 6, Date.now() + offset * 30000);
    if (safeEqual(candidate, value)) return true;
  }
  return false;
}

module.exports = {
  normalizeEmail,
  hashPassword,
  comparePassword,
  safeEqual,
  createCsrfToken,
  sanitizeUser,
  randomToken,
  verifyTotp,
};
