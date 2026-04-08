const express = require('express');
const { getLessonListWithProgress, getLessonById } = require('../services/lessonService');
const { getUserById, markLessonAttempt } = require('../services/userService');
const { PASS_PERCENT, canAccessLesson } = require('../utils/courseRules');

const router = express.Router();

async function getCurrentUser(req) {
  if (!req.session.userId) return null;
  return getUserById(req.session.userId);
}

router.get('/', async (req, res) => {
  const user = await getCurrentUser(req);
  return res.json(await getLessonListWithProgress(user));
});

router.get('/:id', async (req, res) => {
  const lessonId = Number(req.params.id);
  const lesson = await getLessonById(lessonId);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });

  const user = await getCurrentUser(req);
  const accessible = canAccessLesson(user, lessonId);
  if (!accessible) {
    return res.status(403).json({
      error: lessonId > 1 && !user?.accessUnlocked
        ? 'This lesson is locked until payment is verified and your access code is approved.'
        : 'Pass the previous lesson with at least 80% to unlock this lesson.',
    });
  }

  return res.json({ lesson, progress: user?.progress?.[lessonId] || null, passPercent: PASS_PERCENT });
});

router.post('/:id/submit', async (req, res) => {
  const lessonId = Number(req.params.id);
  if (!req.session.userId) return res.status(401).json({ error: 'Please log in first.' });

  const lesson = await getLessonById(lessonId);
  if (!lesson) return res.status(404).json({ error: 'Lesson not found.' });

  const user = await getCurrentUser(req);
  if (!canAccessLesson(user, lessonId)) return res.status(403).json({ error: 'This lesson is locked.' });

  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const totalQuestions = lesson.quiz.length;
  if (!totalQuestions) return res.status(400).json({ error: 'This lesson has no quiz.' });
  if (answers.length !== totalQuestions) return res.status(400).json({ error: 'Please answer every question.' });

  let correct = 0;
  const review = lesson.quiz.map((question, index) => {
    const selected = Number(answers[index]);
    const isCorrect = selected === question.answerIndex;
    if (isCorrect) correct += 1;
    return {
      question: question.question,
      selectedIndex: Number.isNaN(selected) ? null : selected,
      selectedText: Number.isNaN(selected) ? null : question.options[selected] || null,
      correctIndex: question.answerIndex,
      correctText: question.options[question.answerIndex],
      isCorrect,
      explanation: question.explanation,
    };
  });

  const percent = Math.round((correct / totalQuestions) * 100);
  const passed = percent >= PASS_PERCENT;
  const updatedUser = await markLessonAttempt(user.id, lessonId, percent, passed);

  return res.json({
    passed,
    percent,
    correct,
    totalQuestions,
    passPercent: PASS_PERCENT,
    review,
    user: {
      progress: updatedUser.progress,
      accessUnlocked: updatedUser.accessUnlocked,
      isPaid: updatedUser.isPaid,
      isApproved: updatedUser.isApproved,
      completedLesson1: updatedUser.completedLesson1,
      paymentRequestedAt: updatedUser.paymentRequestedAt,
    },
  });
});

module.exports = router;
