const state = {
  csrfToken: '',
  meta: null,
  user: null,
  lessonsPayload: null,
  activeLesson: null,
  activeLessonResult: null,
};

const el = {
  brandName: document.getElementById('brandName'),
  heroSection: document.getElementById('heroSection'),
  dashboardSection: document.getElementById('dashboardSection'),
  openAuthBtn: document.getElementById('openAuthBtn'),
  openDashboardBtn: document.getElementById('openDashboardBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  authModal: document.getElementById('authModal'),
  paymentModal: document.getElementById('paymentModal'),
  codeModal: document.getElementById('codeModal'),
  registerForm: document.getElementById('registerForm'),
  loginForm: document.getElementById('loginForm'),
  codeForm: document.getElementById('codeForm'),
  paymentRequestForm: document.getElementById('paymentRequestForm'),
  lessonsGrid: document.getElementById('lessonsGrid'),
  lessonView: document.getElementById('lessonView'),
  dashboardTitle: document.getElementById('dashboardTitle'),
  dashboardSubtitle: document.getElementById('dashboardSubtitle'),
  summaryCompleted: document.getElementById('summaryCompleted'),
  summaryPercent: document.getElementById('summaryPercent'),
  summaryAccess: document.getElementById('summaryAccess'),
  upgradeBanner: document.getElementById('upgradeBanner'),
  unlockAccessBtn: document.getElementById('unlockAccessBtn'),
  bannerOpenPaymentBtn: document.getElementById('bannerOpenPaymentBtn'),
  bannerOpenCodeBtn: document.getElementById('bannerOpenCodeBtn'),
  fromPaymentOpenCodeBtn: document.getElementById('fromPaymentOpenCodeBtn'),
  coursePrice: document.getElementById('coursePrice'),
  telegramPayLink: document.getElementById('telegramPayLink'),
  telegramCodeLink: document.getElementById('telegramCodeLink'),
  toast: document.getElementById('toast'),
};

function formatPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return `${value} UZS`;
  return `${new Intl.NumberFormat('en-US').format(number)} UZS`;
}

function setLoading(isLoading) {
  state.loading = Boolean(isLoading);
  document.body.classList.toggle('is-loading', state.loading);
}

async function ensureCsrfToken() {
  if (state.csrfToken) return state.csrfToken;
  const response = await fetch('/api/csrf', { credentials: 'same-origin' });
  const payload = await response.json();
  state.csrfToken = payload.csrfToken || '';
  return state.csrfToken;
}

async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(path, {
    headers,
    credentials: 'same-origin',
    ...options,
  });

  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(payload.error || 'Request failed.');
  }

  return payload;
}

function showToast(message, type = 'info') {
  if (!el.toast) return;

  el.toast.textContent = message;
  el.toast.classList.remove('hidden');
  el.toast.style.borderColor =
    type === 'error' ? 'rgba(255,111,145,0.4)' : 'rgba(255,255,255,0.1)';

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    el.toast.classList.add('hidden');
  }, 3400);
}

function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function setAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.authTab === tab);
  });

  if (el.registerForm) {
    el.registerForm.classList.toggle('hidden', tab !== 'register');
  }

  if (el.loginForm) {
    el.loginForm.classList.toggle('hidden', tab !== 'login');
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function speak(text) {
  if (!('speechSynthesis' in window)) {
    showToast('Audio is not supported on this browser.', 'error');
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.92;
  window.speechSynthesis.speak(utterance);
}

function buildTelegramDeepLink(username, text) {
  const cleanUsername = String(username || 'levelupfayzullo')
    .replace('@', '')
    .trim();
  const encodedText = encodeURIComponent(text);
  return `https://t.me/${cleanUsername}?text=${encodedText}`;
}

function buildCodeRequestMessage() {
  const fullName = state.user?.fullName || 'Not provided';
  const email = state.user?.email || 'Not provided';
  const phone = state.user?.phone || 'Not provided';

  return [
    'Hello admin, I finished Lesson 1 and I want my access code.',
    '',
    `My name: ${fullName}`,
    `My email: ${email}`,
    `My phone: ${phone}`,
  ].join('\n');
}

function updateTelegramLinks() {
  const username = state.meta?.telegramUsername || 'levelupfayzullo';
  const cleanUsername = String(username).replace('@', '').trim();
  const profileUrl = `https://t.me/${cleanUsername}`;

  if (el.telegramPayLink) {
    el.telegramPayLink.href = profileUrl;
    el.telegramPayLink.textContent = `Open Telegram @${cleanUsername}`;
  }

  if (el.telegramCodeLink) {
    el.telegramCodeLink.href = buildTelegramDeepLink(
      cleanUsername,
      buildCodeRequestMessage()
    );
    el.telegramCodeLink.textContent = `Get Code via Telegram @${cleanUsername}`;
  }
}

async function loadMeta() {
  state.meta = await api('/api/meta');

  if (el.brandName && state.meta?.appName) {
    el.brandName.textContent = state.meta.appName;
  }

  if (state.meta?.appName) {
    document.title = state.meta.appName;
  }

  if (el.coursePrice) {
    el.coursePrice.textContent = formatPrice(state.meta.coursePrice);
  }

  updateTelegramLinks();
}

async function loadSession() {
  const payload = await api('/api/auth/me');
  state.user = payload.user || null;
  updateTelegramLinks();
}

async function loadLessons() {
  state.lessonsPayload = await api('/api/lessons');
}

async function submitPaymentRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const transactionId = String(formData.get('transactionId') || '').trim();
  const amount = String(formData.get('amount') || '').trim();
  const note = String(formData.get('note') || '').trim();
  try {
    await api('/api/payments/request', {
      method: 'POST',
      body: JSON.stringify({ transactionId, amount, note }),
    });
    showToast('Payment request sent. Please wait for admin review.', 'success');
    form.reset();
    closeModal('paymentModal');
    await loadSession();
    await loadLessons();
    renderApp();
  } catch (error) {
    showToast(error.message || 'Payment request failed.', 'error');
  }
}

function renderHeader() {
  const loggedIn = Boolean(state.user);

  el.openAuthBtn?.classList.toggle('hidden', loggedIn);
  el.openDashboardBtn?.classList.toggle('hidden', !loggedIn);
  el.logoutBtn?.classList.toggle('hidden', !loggedIn);
}

function renderLanding() {
  el.heroSection?.classList.toggle('hidden', Boolean(state.user));
  el.dashboardSection?.classList.toggle('hidden', !state.user);
}

function renderDashboardSummary() {
  if (!state.user || !state.lessonsPayload) return;

  const summary = state.lessonsPayload.summary || {};
  const completedLessons = summary.completedLessons || 0;
  const totalLessons = summary.totalLessons || 30;
  const percent = summary.percent || 0;

  if (el.dashboardTitle) {
    const firstName = (state.user.fullName || 'Student').split(' ')[0];
    el.dashboardTitle.textContent = `Welcome back, ${firstName}`;
  }

  if (el.dashboardSubtitle) {
    el.dashboardSubtitle.textContent = state.user.accessUnlocked
      ? 'Your full course is unlocked. Keep moving lesson by lesson.'
      : state.user.isApproved
        ? 'Admin approved your access. Now enter your code to unlock the full course.'
        : state.user.isPaid
          ? 'Payment marked. Waiting for admin approval before code unlock.'
          : 'Complete Lesson 1 free, then submit your payment request for admin approval.';
  }

  if (el.summaryCompleted) {
    el.summaryCompleted.textContent = `${completedLessons} / ${totalLessons}`;
  }

  if (el.summaryPercent) {
    el.summaryPercent.textContent = `${percent}%`;
  }

  if (el.summaryAccess) {
    el.summaryAccess.textContent = state.user.accessUnlocked
      ? 'Full course'
      : 'Free only';
  }

  const lessonOneProgress = state.user.progress?.['1'];
  const shouldShowUpgrade = lessonOneProgress?.passed && !state.user.accessUnlocked;

  el.upgradeBanner?.classList.toggle('hidden', !shouldShowUpgrade);

  if (el.unlockAccessBtn) {
    el.unlockAccessBtn.textContent = state.user.accessUnlocked
      ? 'Access Unlocked'
      : 'Enter Access Code';
    el.unlockAccessBtn.disabled = Boolean(state.user.accessUnlocked);
  }
}

function lessonCardTemplate(lesson) {
  const statusPill = lesson.progress?.passed
    ? '<span class="pill success">Passed</span>'
    : lesson.locked
      ? '<span class="pill danger">Locked</span>'
      : lesson.free
        ? '<span class="pill primary">Free</span>'
        : '<span class="pill warning">Ready</span>';

  const scorePill = lesson.progress
    ? `<span class="pill">Best ${lesson.progress.bestPercent || 0}%</span>`
    : `<span class="pill">${lesson.estimatedMinutes} min</span>`;

  return `
    <article class="lesson-card ${lesson.locked ? 'locked' : ''}">
      <div class="lesson-meta-row">
        <span class="lesson-number">${lesson.id}</span>
        <span class="pill">${escapeHtml(lesson.coverTag)}</span>
      </div>
      <h3>${escapeHtml(lesson.title)}</h3>
      <p>${escapeHtml(lesson.description)}</p>
      <div class="lesson-pills">
        ${statusPill}
        ${scorePill}
      </div>
      <div class="lock-copy">${escapeHtml(
        lesson.locked ? lesson.lockedReason : lesson.focus
      )}</div>
      <div class="card-actions" style="margin-top:16px;">
        <button
          class="btn ${lesson.locked ? 'btn-ghost' : 'btn-primary'} btn-sm"
          ${lesson.locked ? 'disabled' : ''}
          data-open-lesson="${lesson.id}"
        >
          ${lesson.locked ? 'Locked' : 'Open Lesson'}
        </button>
      </div>
    </article>
  `;
}

function renderLessons() {
  const lessons = state.lessonsPayload?.lessons || [];
  if (!el.lessonsGrid) return;

  el.lessonsGrid.innerHTML =
    lessons.map(lessonCardTemplate).join('') ||
    '<div class="empty-state">No lessons found.</div>';
}

function renderLessonView() {
  const lesson = state.activeLesson;

  if (!lesson || !el.lessonView) {
    if (el.lessonView) {
      el.lessonView.classList.add('hidden');
      el.lessonView.innerHTML = '';
    }
    return;
  }

  const result = state.activeLessonResult;
  const progress = lesson.progress;
  const hasPassed = Boolean(progress?.passed);

  const vocabularyHtml = (lesson.lesson.vocabulary || [])
    .map(
      (item) => `
      <article class="vocab-card">
        <div class="audio-row">
          <div>
            <strong>${escapeHtml(item.en)}</strong>
            <span class="muted">${escapeHtml(item.uz)}</span>
          </div>
          <button class="audio-btn" type="button" data-speak="${escapeHtml(
            item.en
          )}">▶</button>
        </div>
      </article>
    `
    )
    .join('');

  const phrasesHtml = (lesson.lesson.phrases || [])
    .map(
      (item) => `
      <article class="phrase-card">
        <div class="audio-row">
          <div>
            <strong>${escapeHtml(item.en)}</strong>
            <span class="muted">${escapeHtml(item.uz)}</span>
          </div>
          <button class="audio-btn" type="button" data-speak="${escapeHtml(
            item.en
          )}">▶</button>
        </div>
      </article>
    `
    )
    .join('');

  const dialogueHtml = (lesson.lesson.dialogue || [])
    .map(
      (line) => `
      <div class="dialogue-line">
        <span class="dialogue-badge">${escapeHtml(line.speaker)}</span>
        <div class="dialogue-bubble">${escapeHtml(line.text)}</div>
        <button class="audio-btn" type="button" data-speak="${escapeHtml(
          line.text
        )}">▶</button>
      </div>
    `
    )
    .join('');

  const speakingHtml = (lesson.lesson.speaking || [])
    .map(
      (item, index) => `
      <article class="speaking-card">
        <strong>Practice ${index + 1}</strong>
        <p class="muted">${escapeHtml(item)}</p>
      </article>
    `
    )
    .join('');

  const exercisesHtml = (lesson.lesson.exercises || [])
    .map((item, index) => {
      let content = '';

      if (item.type === 'match') {
        content = `
          <p class="muted">${escapeHtml(item.prompt)}</p>
          <ul class="muted">
            ${(item.pairs || [])
              .map(
                (pair) => `<li>${escapeHtml(pair[0])} → ${escapeHtml(pair[1])}</li>`
              )
              .join('')}
          </ul>
        `;
      } else {
        content = `<p class="muted">${escapeHtml(item.prompt)}</p>`;
      }

      return `
        <article class="exercise-card">
          <strong>Exercise ${index + 1}</strong>
          ${content}
          <span class="exercise-answer">Self-check answer: ${escapeHtml(
            item.answer || 'Review the pair list'
          )}</span>
        </article>
      `;
    })
    .join('');

  const quizHtml = (lesson.lesson.quiz || [])
    .map(
      (question, index) => `
      <fieldset class="quiz-card">
        <legend>${index + 1}. ${escapeHtml(question.question)}</legend>
        <div class="quiz-options">
          ${(question.options || [])
            .map(
              (option, optionIndex) => `
            <label class="quiz-option">
              <input
                type="radio"
                name="q-${index}"
                value="${optionIndex}"
                ${
                  result?.submittedAnswers?.[index] === optionIndex ? 'checked' : ''
                }
              />
              <span>${escapeHtml(option)}</span>
            </label>
          `
            )
            .join('')}
        </div>
      </fieldset>
    `
    )
    .join('');

  const reviewHtml = result?.review?.length
    ? `
    <div class="review-grid">
      ${result.review
        .map(
          (item) => `
        <article class="review-card ${item.isCorrect ? 'pass' : 'fail'}">
          <strong>${escapeHtml(item.question)}</strong>
          <p class="muted" style="margin:8px 0 6px;">Your answer: ${escapeHtml(
            item.selectedText || 'No answer'
          )}</p>
          <p class="muted" style="margin:0 0 6px;">Correct answer: ${escapeHtml(
            item.correctText
          )}</p>
          <p class="muted" style="margin:0;">${escapeHtml(item.explanation)}</p>
        </article>
      `
        )
        .join('')}
    </div>
  `
    : '';

  const latestResultHtml = result
    ? `
    <div class="result-panel ${result.passed ? 'pass' : 'fail'}">
      <span class="eyebrow">Lesson result</span>
      <h3>${
        result.passed
          ? 'Excellent — lesson passed!'
          : 'Keep going — repeat this lesson.'
      }</h3>
      <p class="muted">
        You scored <strong>${result.percent}%</strong>.
        You need at least ${lesson.passPercent}% to pass.
      </p>
      ${
        result.passed
          ? `<div class="inline-actions"><button class="btn btn-primary btn-sm" data-next-lesson="${
              lesson.lesson.id + 1
            }">Open next lesson</button></div>`
          : '<p class="muted">Review the feedback below, practice the audio again, and retake the test.</p>'
      }
      ${reviewHtml}
    </div>
  `
    : hasPassed
      ? `
    <div class="result-panel pass">
      <span class="eyebrow">Saved progress</span>
      <h3>You already passed this lesson.</h3>
      <p class="muted">Best score: ${progress.bestPercent}%.</p>
    </div>
  `
      : '';

  el.lessonView.innerHTML = `
    <section class="glass-card lesson-header">
      <div>
        <span class="eyebrow">Lesson ${lesson.lesson.id} · ${escapeHtml(
          lesson.lesson.focus
        )}</span>
        <h2>${escapeHtml(lesson.lesson.title)}</h2>
        <p>${escapeHtml(lesson.lesson.description)}</p>
      </div>
      <div class="lesson-pills">
        <span class="pill ${lesson.lesson.free ? 'primary' : 'warning'}">${
          lesson.lesson.free ? 'Free' : 'Premium'
        }</span>
        <span class="pill">${lesson.lesson.estimatedMinutes} min</span>
        <span class="pill">Pass ${lesson.passPercent}%</span>
      </div>
    </section>

    <section class="lesson-sections">
      <article class="glass-card lesson-section">
        <h3>Vocabulary</h3>
        <div class="vocab-grid">${vocabularyHtml}</div>
      </article>

      <article class="glass-card lesson-section">
        <h3>Phrases</h3>
        <div class="phrase-grid">${phrasesHtml}</div>
      </article>

      <article class="glass-card lesson-section">
        <h3>Mini dialogue</h3>
        <div class="dialogue-list">${dialogueHtml}</div>
      </article>

      <article class="glass-card lesson-section">
        <h3>Speaking practice</h3>
        <div class="speaking-grid">${speakingHtml}</div>
      </article>

      <article class="glass-card lesson-section">
        <h3>Exercises</h3>
        <div class="exercise-grid">${exercisesHtml}</div>
      </article>

      <article class="glass-card lesson-section">
        <h3>Lesson test</h3>
        <form id="quizForm">
          <div class="quiz-grid">${quizHtml}</div>
          <div class="quiz-submit-row">
            <span class="muted">You need ${lesson.passPercent}% to unlock the next lesson.</span>
            <button class="btn btn-primary" type="submit">Submit test</button>
          </div>
        </form>
      </article>
    </section>

    ${latestResultHtml}
  `;

  el.lessonView.classList.remove('hidden');
  el.lessonView.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function render() {
  renderHeader();
  renderLanding();

  if (state.user && state.lessonsPayload) {
    renderDashboardSummary();
    renderLessons();
  }

  renderLessonView();
}

async function refreshAll() {
  setLoading(true);
  try {
    await Promise.all([loadSession(), loadLessons()]);
    render();
  } finally {
    setLoading(false);
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    state.user = response.user;
    updateTelegramLinks();
    await loadLessons();
    closeModal('authModal');
    render();
    showToast('Registration successful. Lesson 1 is ready for you.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleLogin(event) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    state.user = response.user;
    updateTelegramLinks();
    await loadLessons();
    closeModal('authModal');
    render();
    showToast('Welcome back.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    state.activeLesson = null;
    state.activeLessonResult = null;
    updateTelegramLinks();
    await loadLessons();
    render();
    showToast('Logged out successfully.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openLesson(id) {
  try {
    const payload = await api(`/api/lessons/${id}`);
    state.activeLesson = payload;
    state.activeLessonResult = null;
    localStorage.setItem('levelup:lastLessonId', String(id));
    renderLessonView();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleQuizSubmit(event) {
  event.preventDefault();

  if (!state.activeLesson?.lesson) return;

  const answers = state.activeLesson.lesson.quiz.map((_, index) => {
    const selected = event.currentTarget.querySelector(
      `input[name="q-${index}"]:checked`
    );
    return selected ? Number(selected.value) : null;
  });

  if (answers.some((answer) => answer === null)) {
    showToast('Please answer all questions before submitting.', 'error');
    return;
  }

  try {
    const result = await api(
      `/api/lessons/${state.activeLesson.lesson.id}/submit`,
      {
        method: 'POST',
        body: JSON.stringify({ answers }),
      }
    );

    state.activeLessonResult = { ...result, submittedAnswers: answers };

    await refreshAll();
    await openLesson(state.activeLesson.lesson.id);

    state.activeLessonResult = { ...result, submittedAnswers: answers };
    renderLessonView();

    showToast(
      result.passed ? 'Lesson passed. Great job!' : 'Lesson not passed yet. Try again.'
    );

    if (
      state.activeLesson.lesson.id === 1 &&
      result.passed &&
      !state.user?.accessUnlocked
    ) {
      openModal('paymentModal');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function verifyCode(event) {
  event.preventDefault();

  const formData = new FormData(event.currentTarget);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await api('/api/access/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    state.user = response.user;
    updateTelegramLinks();
    closeModal('codeModal');
    await loadLessons();
    render();
    showToast('Access unlocked. Lessons 2–30 are now available as you progress.');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function bindGlobalEvents() {
  el.openAuthBtn?.addEventListener('click', () => openModal('authModal'));

  document.querySelectorAll('[data-open-auth]').forEach((button) => {
    button.addEventListener('click', () => openModal('authModal'));
  });

  el.openDashboardBtn?.addEventListener('click', () => {
    document.getElementById('dashboardSection')?.scrollIntoView({
      behavior: 'smooth',
    });
  });

  el.logoutBtn?.addEventListener('click', handleLogout);

  el.unlockAccessBtn?.addEventListener('click', () => {
    if (!state.user?.accessUnlocked) {
      openModal('codeModal');
    }
  });

  el.bannerOpenPaymentBtn?.addEventListener('click', () => openModal('paymentModal'));
  el.bannerOpenCodeBtn?.addEventListener('click', () => openModal('codeModal'));

  el.fromPaymentOpenCodeBtn?.addEventListener('click', () => {
    closeModal('paymentModal');
    openModal('codeModal');
  });

  document.querySelectorAll('[data-close-modal]').forEach((node) => {
    node.addEventListener('click', () => closeModal(node.dataset.closeModal));
  });

  document.querySelectorAll('.auth-tab').forEach((button) => {
    button.addEventListener('click', () => setAuthTab(button.dataset.authTab));
  });

  el.registerForm?.addEventListener('submit', handleRegister);
  el.loginForm?.addEventListener('submit', handleLogin);
  el.codeForm?.addEventListener('submit', verifyCode);
  el.paymentRequestForm?.addEventListener('submit', submitPaymentRequest);

  document.addEventListener('click', (event) => {
    const lessonButton = event.target.closest('[data-open-lesson]');
    if (lessonButton) {
      openLesson(lessonButton.dataset.openLesson);
    }

    const nextLessonButton = event.target.closest('[data-next-lesson]');
    if (nextLessonButton) {
      const nextId = Number(nextLessonButton.dataset.nextLesson);
      if (
        Number.isFinite(nextId) &&
        state.lessonsPayload?.lessons?.some(
          (lesson) => lesson.id === nextId && !lesson.locked
        )
      ) {
        openLesson(nextId);
      }
    }

    const audioButton = event.target.closest('[data-speak]');
    if (audioButton) {
      speak(audioButton.dataset.speak);
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'quizForm') {
      handleQuizSubmit(event);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      ['authModal', 'paymentModal', 'codeModal'].forEach(closeModal);
    }
  });
}

async function init() {
  bindGlobalEvents();
  setAuthTab('register');

  try {
    await loadMeta();
    await refreshAll();
  } catch (error) {
    showToast(error.message || 'Failed to load the app.', 'error');
  }
}

init();