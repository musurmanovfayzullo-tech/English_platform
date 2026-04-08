const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePassword, validateAccessCode } = require('../utils/validation');

test('password validation enforces strength', () => {
  assert.equal(validatePassword('weak'), 'Password must be at least 8 characters.');
  assert.equal(validatePassword('StrongPass1'), null);
});

test('access code validation enforces expected format', () => {
  assert.equal(validateAccessCode('bad-code'), 'Access code format is invalid.');
  assert.equal(validateAccessCode('LVL-ABC12345'), null);
});
