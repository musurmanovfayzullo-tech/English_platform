const test = require('node:test');
const assert = require('node:assert/strict');
const { canAccessLesson, summarizeProgress } = require('../utils/courseRules');

test('lesson one is always accessible', () => {
  assert.equal(canAccessLesson(null, 1), true);
  assert.equal(canAccessLesson({ accessUnlocked: false }, 1), true);
});

test('locked user cannot access lesson two', () => {
  assert.equal(canAccessLesson({ accessUnlocked: false }, 2), false);
});

test('summary counts passed lessons', () => {
  const summary = summarizeProgress({ progress: { 1: { passed: true }, 2: { passed: false }, 3: { passed: true } } }, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.equal(summary.completedLessons, 2);
  assert.equal(summary.percent, 67);
});
