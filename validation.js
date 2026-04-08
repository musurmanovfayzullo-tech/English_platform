const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d+\-()\s]{7,20}$/;
const NAME_RE = /^[\p{L} .'-]+$/u;

function assertString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function validateEmail(email) {
  const cleaned = assertString(email).toLowerCase();
  if (!cleaned) return 'Email is required.';
  if (cleaned.length > 120) return 'Email is too long.';
  if (!EMAIL_RE.test(cleaned)) return 'Please enter a valid email address.';
  return null;
}

function validatePassword(password) {
  const value = typeof password === 'string' ? password : '';
  if (value.length < 8) return 'Password must be at least 8 characters.';
  if (value.length > 72) return 'Password is too long.';
  if (!/[a-z]/.test(value)) return 'Password must include at least one lowercase letter.';
  if (!/[A-Z]/.test(value)) return 'Password must include at least one uppercase letter.';
  if (!/[0-9]/.test(value)) return 'Password must include at least one number.';
  return null;
}

function validateFullName(fullName) {
  const value = assertString(fullName);
  if (!value) return 'Full name is required.';
  if (value.length < 2) return 'Full name is too short.';
  if (value.length > 80) return 'Full name is too long.';
  if (!NAME_RE.test(value)) return 'Full name contains invalid characters.';
  return null;
}

function validatePhone(phone) {
  const value = assertString(phone);
  if (!value) return null;
  if (!PHONE_RE.test(value)) return 'Please enter a valid phone number.';
  return null;
}

function validateAccessCode(code) {
  const value = assertString(code).toUpperCase();
  if (!value) return 'Please enter an access code.';
  if (!/^LVL-[A-Z0-9-]{6,20}$/.test(value)) return 'Access code format is invalid.';
  return null;
}

module.exports = {
  assertString,
  validateEmail,
  validatePassword,
  validateFullName,
  validatePhone,
  validateAccessCode,
};
