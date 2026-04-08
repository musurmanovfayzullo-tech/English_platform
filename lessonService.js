const path = require('path');
const { readJson } = require('../utils/fsdb');
const { canAccessLesson, summarizeProgress } = require('../utils/courseRules');

const LESSONS_FILE = path.join(__dirname, '..', 'data', 'lessons.json');

async function getAllLessons() {
  return readJson(LESSONS_FILE, []);
}

function mapLessonForList(lesson, user) {
  const progress = user?.progress?.[lesson.id] || null;
  const accessible = canAccessLesson(user, lesson.id);
  const lockedByPayment = lesson.id > 1 && !user?.accessUnlocked;
  const lockedByProgress = lesson.id > 1 && user?.accessUnlocked && !accessible;

  return {
    id: lesson.id,
    slug: lesson.slug,
    title: lesson.title,
    description: lesson.description,
    focus: lesson.focus,
    free: lesson.free,
    estimatedMinutes: lesson.estimatedMinutes,
    coverTag: lesson.coverTag,
    accessible,
    locked: !accessible,
    lockedReason: lockedByPayment
      ? 'Complete Lesson 1, pay, and enter your access code to continue.'
      : lockedByProgress
        ? 'Pass the previous lesson with at least 80% to unlock this lesson.'
        : '',
    progress: progress
      ? {
          attempts: progress.attempts || 0,
          bestPercent: progress.bestPercent || 0,
          passed: Boolean(progress.passed),
          completedAt: progress.completedAt || null,
        }
      : null,
  };
}

async function getLessonListWithProgress(user) {
  const lessons = await getAllLessons();
  return {
    lessons: lessons.map((lesson) => mapLessonForList(lesson, user)),
    summary: summarizeProgress(user, lessons),
  };
}

async function getLessonById(id) {
  const lessons = await getAllLessons();
  return lessons.find((lesson) => Number(lesson.id) === Number(id)) || null;
}

module.exports = {
  getAllLessons,
  getLessonListWithProgress,
  getLessonById,
  mapLessonForList,
};
