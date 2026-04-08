const path = require('path');
const crypto = require('crypto');
const { readJson, writeJson } = require('../utils/fsdb');
const {
  hashPassword,
  comparePassword,
  normalizeEmail,
} = require('../utils/security');
const {
  validateAccessCode,
  validateEmail,
  validateFullName,
  validatePassword,
  validatePhone,
} = require('../utils/validation');
const {
  sendAccessCodeMessage,
  sendPaymentRequestMessage,
  sendAccessApprovedMessage,
} = require('./telegramService');
const { addLog } = require('./auditService');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

const CODE_PREFIX = 'enc::';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function nowIso() {
  return new Date().toISOString();
}

function getSecretKey() {
  const secret = process.env.SESSION_SECRET || 'development-session-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptAccessCode(plainText) {
  const iv = crypto.randomBytes(12);
  const key = getSecretKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${CODE_PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptAccessCode(value) {
  if (!value) return '';
  if (typeof value === 'string' && !value.startsWith(CODE_PREFIX)) return value;
  try {
    const raw = String(value).slice(CODE_PREFIX.length);
    const [ivB64, tagB64, encryptedB64] = raw.split('.');
    if (!ivB64 || !tagB64 || !encryptedB64) return '';
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');
    const key = getSecretKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

function maskAccessCode(code) {
  const value = String(code || '').trim();
  if (!value) return null;
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}-${'*'.repeat(Math.max(value.length - 4, 4))}`;
}

function generateRandomAccessCode(length = 8) {
  let code = 'LVL-';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

function createBaseProgress() {
  return {};
}

function normalizePhone(phone = '') {
  return String(phone || '').trim();
}

function sanitizeStoredUser(user) {
  const plainCode = decryptAccessCode(user.accessCode);
  return {
    ...user,
    fullName: String(user.fullName || '').trim(),
    email: normalizeEmail(user.email || ''),
    phone: normalizePhone(user.phone || ''),
    progress: user.progress && typeof user.progress === 'object' ? user.progress : {},
    accessCode: user.accessCode || '',
    accessCodeMasked: user.accessCodeMasked || maskAccessCode(plainCode),
    accessCodeUsedAt: user.accessCodeUsedAt || null,
    accessUnlocked: Boolean(user.accessUnlocked),
    isPaid: Boolean(user.isPaid ?? user.paid),
    paid: Boolean(user.paid ?? user.isPaid),
    isApproved: Boolean(user.isApproved ?? user.accessApproved),
    accessApproved: Boolean(user.accessApproved ?? user.isApproved),
    createdAt: user.createdAt || nowIso(),
    updatedAt: user.updatedAt || nowIso(),
    paymentRequestedAt: user.paymentRequestedAt || null,
    approvedAt: user.approvedAt || null,
    unlockedAt: user.unlockedAt || user.accessUnlockedAt || null,
    accessUnlockedAt: user.accessUnlockedAt || user.unlockedAt || null,
    completedLesson1: Boolean(user.completedLesson1 || user.progress?.['1']?.passed),
  };
}

async function getUsers() {
  const users = await readJson(USERS_FILE, []);
  if (!Array.isArray(users)) return [];
  return users.map(sanitizeStoredUser);
}

async function saveUsers(users) {
  await writeJson(USERS_FILE, users);
  return users;
}

async function getAllUsers() { return getUsers(); }
async function getUserById(id) {
  const users = await getUsers();
  return users.find((user) => String(user.id) === String(id)) || null;
}

async function updateUser(userId, updater) {
  const users = await getUsers();
  const index = users.findIndex((user) => String(user.id) === String(userId));
  if (index === -1) return null;
  const currentUser = users[index];
  const nextUser = typeof updater === 'function' ? updater({ ...currentUser }) : { ...currentUser, ...updater };
  const normalizedNext = sanitizeStoredUser({ ...currentUser, ...nextUser, id: currentUser.id, updatedAt: nowIso() });
  users[index] = normalizedNext;
  await saveUsers(users);
  return normalizedNext;
}

async function createUser({ fullName, email, phone, password }) {
  const users = await getUsers();
  const cleanName = String(fullName || '').trim();
  const normalizedEmail = normalizeEmail(email || '');
  const cleanPhone = normalizePhone(phone || '');

  const fullNameError = validateFullName(cleanName);
  if (fullNameError) throw new Error(fullNameError);
  const emailError = validateEmail(normalizedEmail);
  if (emailError) throw new Error(emailError);
  const phoneError = validatePhone(cleanPhone);
  if (phoneError) throw new Error(phoneError);
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);

  const existing = users.find((user) => normalizeEmail(user.email) === normalizedEmail);
  if (existing) throw new Error('An account with this email already exists.');

  const passwordHash = await hashPassword(password);
  const plainAccessCode = generateRandomAccessCode();
  const user = sanitizeStoredUser({
    id: crypto.randomUUID(),
    fullName: cleanName,
    email: normalizedEmail,
    phone: cleanPhone,
    passwordHash,
    accessCode: encryptAccessCode(plainAccessCode),
    accessCodeMasked: maskAccessCode(plainAccessCode),
    accessCodeUsedAt: null,
    accessUnlocked: false,
    isPaid: false,
    paid: false,
    isApproved: false,
    accessApproved: false,
    progress: createBaseProgress(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    paymentRequestedAt: null,
    approvedAt: null,
    unlockedAt: null,
    accessUnlockedAt: null,
    completedLesson1: false,
  });

  users.push(user);
  await saveUsers(users);
  await addLog('user_registered', { userId: user.id, email: user.email });

  try {
    await sendAccessCodeMessage({ fullName: user.fullName, email: user.email, phone: user.phone, accessCode: plainAccessCode });
  } catch (error) {
    console.error('Telegram notification failed:', error.message);
  }

  return user;
}

async function authenticateUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email || '');
  const users = await getUsers();
  const user = users.find((item) => normalizeEmail(item.email) === normalizedEmail);
  if (!user) throw new Error('Invalid email or password.');
  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) throw new Error('Invalid email or password.');
  return user;
}

async function markLessonAttempt(userId, lessonId, percent, passed) {
  const updated = await updateUser(userId, (current) => {
    const currentProgress = current.progress?.[lessonId] || {};
    const lessonUpdate = {
      attempts: (currentProgress.attempts || 0) + 1,
      bestPercent: Math.max(currentProgress.bestPercent || 0, percent),
      latestPercent: percent,
      passed: Boolean(currentProgress.passed || passed),
      completedAt: passed ? nowIso() : currentProgress.completedAt || null,
      lastTriedAt: nowIso(),
    };

    const next = {
      ...current,
      progress: { ...(current.progress || {}), [lessonId]: lessonUpdate },
    };

    if (Number(lessonId) === 1 && passed) {
      next.completedLesson1 = true;
      next.paymentRequestedAt = current.paymentRequestedAt || nowIso();
    }

    return next;
  });

  if (updated && Number(lessonId) === 1 && passed && !updated.accessUnlocked) {
    try {
      await sendPaymentRequestMessage({
        fullName: updated.fullName,
        email: updated.email,
        phone: updated.phone,
        lessonId,
        bestPercent: updated.progress?.[lessonId]?.bestPercent || percent,
      });
    } catch (error) {
      console.error('Telegram payment request failed:', error.message);
    }
    await addLog('lesson1_passed_payment_requested', { userId: updated.id, lessonId, percent });
  }

  return updated;
}

async function verifyAccessCode(userId, code) {
  const cleaned = String(code || '').trim().toUpperCase();
  const codeError = validateAccessCode(cleaned);
  if (codeError) throw new Error(codeError);

  const user = await getUserById(userId);
  if (!user) throw new Error('User not found.');
  if (!user.completedLesson1) throw new Error('First complete Lesson 1 before entering an access code.');
  if (!user.isPaid) throw new Error('Payment has not been marked yet. Please contact admin first.');
  if (!user.isApproved) throw new Error('Your access is waiting for admin approval.');
  if (user.accessCodeUsedAt) throw new Error('This access code has already been used. Please contact admin for a new code.');

  const actualCode = decryptAccessCode(user.accessCode).trim().toUpperCase();
  if (!actualCode || actualCode !== cleaned) throw new Error('Incorrect access code. Please check it and try again.');

  const updated = await updateUser(userId, (current) => ({
    ...current,
    accessUnlocked: true,
    accessCodeUsedAt: nowIso(),
    unlockedAt: nowIso(),
    accessUnlockedAt: nowIso(),
  }));
  await addLog('access_unlocked', { userId, codeUsed: true });
  return updated;
}

async function setPaidStatus(userId, paid) {
  const updated = await updateUser(userId, (current) => ({ ...current, isPaid: Boolean(paid), paid: Boolean(paid) }));
  if (updated) await addLog('payment_status_changed', { userId, paid: Boolean(paid) });
  return updated;
}

async function approveUserAccess(userId) {
  const updated = await updateUser(userId, (current) => {
    if (!current.isPaid) {
      throw new Error('User must be marked as paid before approval.');
    }
    if (!current.completedLesson1) {
      throw new Error('User must complete Lesson 1 before approval.');
    }
    return {
      ...current,
      isApproved: true,
      accessApproved: true,
      approvedAt: current.approvedAt || nowIso(),
    };
  });
  if (updated) {
    await addLog('access_approved', { userId });
    try {
      const code = decryptAccessCode(updated.accessCode);
      await sendAccessApprovedMessage({ fullName: updated.fullName, email: updated.email, accessCode: code });
    } catch (error) {
      console.error('Telegram approval send failed:', error.message);
    }
  }
  return updated;
}

async function revokeUserAccess(userId) {
  const updated = await updateUser(userId, (current) => ({
    ...current,
    accessUnlocked: false,
    isApproved: false,
    accessApproved: false,
    isPaid: false,
    paid: false,
    unlockedAt: null,
    accessUnlockedAt: null,
    accessCodeUsedAt: null,
  }));
  if (updated) await addLog('access_revoked', { userId });
  return updated;
}

async function revealAccessCode(userId) {
  const user = await getUserById(userId);
  if (!user) return null;
  const code = decryptAccessCode(user.accessCode);
  return code || null;
}

async function regenerateAccessCode(userId) {
  const nextCode = generateRandomAccessCode();
  const updated = await updateUser(userId, (current) => ({
    ...current,
    accessCode: encryptAccessCode(nextCode),
    accessCodeMasked: maskAccessCode(nextCode),
    accessCodeUsedAt: null,
    accessUnlocked: false,
    unlockedAt: null,
    accessUnlockedAt: null,
  }));
  if (!updated) throw new Error('User not found.');
  await addLog('access_code_regenerated', { userId });
  try {
    await sendAccessCodeMessage({ fullName: updated.fullName, email: updated.email, phone: updated.phone, accessCode: nextCode });
  } catch (error) {
    console.error('Telegram code regeneration failed:', error.message);
  }
  return updated;
}

module.exports = {
  getAllUsers,
  getUserById,
  getUserByEmail: async (email) => {
    const normalized = normalizeEmail(email);
    const users = await getUsers();
    return users.find((user) => normalizeEmail(user.email) === normalized) || null;
  },
  updateUser,
  createUser,
  authenticateUser,
  verifyAccessCode,
  setPaidStatus,
  approveUserAccess,
  revokeUserAccess,
  regenerateAccessCode,
  revealAccessCode,
  markLessonAttempt,
};
