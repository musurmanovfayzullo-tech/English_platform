const PASS_PERCENT = 80;

function getPassPercent() {
  return PASS_PERCENT;
}

function hasPassedLesson(user, lessonId) {
  return Boolean(user?.progress?.[lessonId]?.passed);
}

function canAccessLesson(user, lessonId) {
  if (!user) return lessonId === 1;
  if (lessonId === 1) return true;
  if (!user.accessUnlocked) return false;
  return hasPassedLesson(user, lessonId - 1);
}

function getNextLessonId(currentLessonId, totalLessons) {
  return currentLessonId < totalLessons ? currentLessonId + 1 : null;
}

function summarizeProgress(user, lessons) {
  const progress = user?.progress || {};
  const completedLessons = Object.values(progress).filter((item) => item?.passed).length;
  const totalLessons = lessons.length;
  const percent = totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const lastPassedLessonId = Object.keys(progress)
    .map(Number)
    .filter((lessonId) => progress[lessonId]?.passed)
    .sort((a, b) => b - a)[0] || 0;

  return {
    completedLessons,
    totalLessons,
    percent,
    lastPassedLessonId,
  };
}

module.exports = {
  PASS_PERCENT,
  getPassPercent,
  hasPassedLesson,
  canAccessLesson,
  getNextLessonId,
  summarizeProgress,
};
