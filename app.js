/* ==========================================================================
   State & Configuration
   ========================================================================== */

let examData = null;
let currentSectionIdx = 0;
let currentQuestionIdx = 0;
let sectionSecondsLeft = 0;
let timerInterval = null;
let activeReviewSecIdx = 0;
let isExamActive = false;
let candidateName = 'John Smith';

const state = {
  responses: {}
};

/* ==========================================================================
   Lifecycle & Initialization
   ========================================================================== */

window.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  fetch('questions.json')
    .then((res) => res.json())
    .then((data) => {
      examData = data;
      initData();
    })
    .catch((err) => {
      console.error('Error loading questions.json:', err);
    });
});

window.addEventListener('beforeunload', (e) => {
  if (isExamActive) {
    e.preventDefault();
  }
});

function initData() {
  let totalQ = 0;

  examData.sections.forEach((sec) => {
    sec.questions.forEach((q) => {
      totalQ++;
      state.responses[q.id] = {
        selectedOption: null,
        status: 'NOT_VISITED'
      };
    });
  });

  document.getElementById('table-total-q').innerText = totalQ;

  setupScreenTransitions();
  loadLastUpdatedCommit();
  restoreSavedSession();
}

/* ==========================================================================
   Theme Management
   ========================================================================== */

function setupTheme() {
  const globalBtn = document.getElementById('global-theme-btn');
  const examBtn = document.getElementById('theme-toggle-btn');
  const savedTheme = sessionStorage.getItem('cbt-theme') || 'light';

  function applyTheme(isDark) {
    if (isDark) {
      document.body.classList.add('dark-mode');
      if (globalBtn) globalBtn.innerText = '☀️ Light Mode';
      if (examBtn) examBtn.innerText = '☀️ Light Mode';
    } else {
      document.body.classList.remove('dark-mode');
      if (globalBtn) globalBtn.innerText = '🌙 Dark Mode';
      if (examBtn) examBtn.innerText = '🌙 Dark Mode';
    }
  }

  function toggle() {
    const isDark = document.body.classList.toggle('dark-mode');
    sessionStorage.setItem('cbt-theme', isDark ? 'dark' : 'light');
    applyTheme(isDark);
  }

  applyTheme(savedTheme === 'dark');

  if (globalBtn) globalBtn.onclick = toggle;
  if (examBtn) examBtn.onclick = toggle;
}

/* ==========================================================================
   Session Storage & Persistence
   ========================================================================== */

function saveSessionState() {
  if (!isExamActive) return;

  const payload = {
    candidateName,
    currentSectionIdx,
    currentQuestionIdx,
    sectionSecondsLeft,
    responses: state.responses
  };

  sessionStorage.setItem('cbt_active_exam', JSON.stringify(payload));
}

function restoreSavedSession() {
  const rawData = sessionStorage.getItem('cbt_active_exam');
  if (!rawData) return;

  try {
    const saved = JSON.parse(rawData);
    if (saved && saved.responses) {
      if (saved.candidateName) {
        updateCandidateName(saved.candidateName);
        const loginInput = document.getElementById('login-username');
        if (loginInput) loginInput.value = saved.candidateName;
      }

      state.responses = saved.responses;
      currentSectionIdx = saved.currentSectionIdx;
      currentQuestionIdx = saved.currentQuestionIdx;
      sectionSecondsLeft = saved.sectionSecondsLeft;
      isExamActive = true;

      showScreen('view-exam');
      renderSectionHeaders();
      renderPalette();
      renderCurrentQuestion();
      startTimer();
    }
  } catch (err) {
    sessionStorage.removeItem('cbt_active_exam');
  }
}

/* ==========================================================================
   Navigation & UI Screen Transitions
   ========================================================================== */

function showScreen(screenId) {
  document.querySelectorAll('.screen-view').forEach((el) => {
    el.style.display = 'none';
  });
  document.getElementById(screenId).style.display = 'block';
}

function updateCandidateName(newName) {
  candidateName = newName.trim() || 'John Smith';
  document.querySelectorAll('.disp-cand-name').forEach((el) => {
    el.innerText = candidateName;
  });
}

function setupScreenTransitions() {
  document.getElementById('btn-login').onclick = () => {
    const inputVal = document.getElementById('login-username').value;
    updateCandidateName(inputVal);
    saveSessionState();
    showScreen('view-instructions-1');
  };

  document.getElementById('btn-inst-next').onclick = () => {
    showScreen('view-instructions-2');
  };

  document.getElementById('btn-inst-prev').onclick = () => {
    showScreen('view-instructions-1');
  };

  const declCheck = document.getElementById('decl-check');
  declCheck.onchange = () => {
    document.getElementById('btn-ready-begin').disabled = !declCheck.checked;
  };

  document.getElementById('btn-ready-begin').onclick = () => {
    isExamActive = true;
    showScreen('view-exam');
    startSection(0);
  };

  document.getElementById('btn-save-next').onclick = () => handleSaveAndNext();
  document.getElementById('btn-mark-review').onclick = () => handleMarkForReviewAndNext();
  document.getElementById('btn-clear-response').onclick = () => handleClearResponse();
  document.getElementById('btn-prev-q').onclick = () => handlePreviousQuestion();

  document.getElementById('btn-submit-exam').onclick = () => {
    const confirmed = confirm(
      'Are you sure you want to submit the examination? You will not be able to modify your answers.'
    );
    if (confirmed) {
      clearInterval(timerInterval);
      showExamSummary();
    }
  };

  document.getElementById('btn-summary-next').onclick = () => {
    showScreen('view-exit');
  };

  document.getElementById('btn-exit-exam').onclick = () => {
    renderAnalytics();
  };

  /* Mobile Drawer Controls */
  const togglePaletteBtn = document.getElementById('btn-toggle-palette');
  const closePaletteBtn = document.getElementById('btn-close-palette');
  const paletteDrawer = document.querySelector('.cbt-side-palette');
  const paletteBackdrop = document.getElementById('palette-backdrop');

  function closePalette() {
    if (paletteDrawer) paletteDrawer.classList.remove('open');
    if (paletteBackdrop) paletteBackdrop.classList.remove('active');
  }

  if (togglePaletteBtn && paletteDrawer) {
    togglePaletteBtn.onclick = () => {
      paletteDrawer.classList.toggle('open');
      if (paletteBackdrop) paletteBackdrop.classList.toggle('active');
    };
  }

  if (closePaletteBtn) closePaletteBtn.onclick = closePalette;
  if (paletteBackdrop) paletteBackdrop.onclick = closePalette;
}

/* ==========================================================================
   Section Management & Timer
   ========================================================================== */

function startSection(idx) {
  currentSectionIdx = idx;
  currentQuestionIdx = 0;
  sectionSecondsLeft = examData.sections[idx].durationMinutes * 60;

  const firstQ = examData.sections[idx].questions[0];
  if (state.responses[firstQ.id].status === 'NOT_VISITED') {
    state.responses[firstQ.id].status = 'NOT_ANSWERED';
  }

  renderSectionHeaders();
  renderPalette();
  renderCurrentQuestion();
  startTimer();
  saveSessionState();
}

function startTimer() {
  clearInterval(timerInterval);
  updateTimerUI();

  timerInterval = setInterval(() => {
    sectionSecondsLeft--;
    updateTimerUI();
    saveSessionState();

    if (sectionSecondsLeft <= 0) {
      clearInterval(timerInterval);
      handleSectionTimerExpiry();
    }
  }, 1000);
}

function handleSectionTimerExpiry() {
  if (currentSectionIdx < examData.sections.length - 1) {
    startSection(currentSectionIdx + 1);
  } else {
    showExamSummary();
  }
}

function updateTimerUI() {
  const m = String(Math.floor(sectionSecondsLeft / 60)).padStart(2, '0');
  const s = String(sectionSecondsLeft % 60).padStart(2, '0');
  document.getElementById('exam-timer').innerText = `${m}:${s}`;
}

function getSectionStats(sec) {
  let ans = 0;
  let notAns = 0;
  let rev = 0;
  let revAns = 0;
  let notVis = 0;

  sec.questions.forEach((q) => {
    const st = state.responses[q.id].status;
    if (st === 'ANSWERED') ans++;
    else if (st === 'NOT_ANSWERED') notAns++;
    else if (st === 'REVIEW') rev++;
    else if (st === 'REVIEW_ANSWERED') revAns++;
    else notVis++;
  });

  return { ans, notAns, rev, revAns, notVis };
}

function renderSectionHeaders() {
  const tabsContainer = document.getElementById('cbt-sec-tab-list');
  tabsContainer.innerHTML = '';

  examData.sections.forEach((sec, idx) => {
    const tab = document.createElement('div');
    tab.className = `tab-pill ${idx === currentSectionIdx ? 'active' : ''}`;
    tab.innerHTML = `
      <span class="tab-label">${sec.name} <span class="tab-info-icon">ℹ</span></span>
      <div class="sec-hover-popup"></div>
    `;

    tab.onmouseenter = () => {
      const stats = getSectionStats(sec);
      const popup = tab.querySelector('.sec-hover-popup');
      popup.innerHTML = `
        <div class="popup-title">${sec.name} Status</div>
        <div class="popup-grid">
          <div class="popup-row">
            <span class="shape-answered p-mini-shape"></span>
            <span>Answered</span>
            <strong>${stats.ans}</strong>
          </div>
          <div class="popup-row">
            <span class="shape-not-answered p-mini-shape"></span>
            <span>Not Answered</span>
            <strong>${stats.notAns}</strong>
          </div>
          <div class="popup-row">
            <span class="shape-review p-mini-shape"></span>
            <span>Marked for Review</span>
            <strong>${stats.rev}</strong>
          </div>
          <div class="popup-row">
            <span class="shape-review-ans p-mini-shape"></span>
            <span>Ans & Marked</span>
            <strong>${stats.revAns}</strong>
          </div>
          <div class="popup-row">
            <span class="shape-not-visited p-mini-shape"></span>
            <span>Not Visited</span>
            <strong>${stats.notVis}</strong>
          </div>
        </div>
      `;
    };

    tabsContainer.appendChild(tab);
  });

  document.getElementById('active-sec-tag').innerText = examData.sections[currentSectionIdx].name;
  document.getElementById('pal-sec-name').innerText = examData.sections[currentSectionIdx].name;
}

/* ==========================================================================
   Question Handling & Palette
   ========================================================================== */

function getCurrentQuestion() {
  return examData.sections[currentSectionIdx].questions[currentQuestionIdx];
}

function renderCurrentQuestion() {
  const q = getCurrentQuestion();
  const qState = state.responses[q.id];

  if (qState.status === 'NOT_VISITED') {
    qState.status = 'NOT_ANSWERED';
  }

  document.getElementById('q-number-title').innerText = `Question No. ${currentQuestionIdx + 1}`;
  document.getElementById('q-statement').innerText = q.question;

  const prevBtn = document.getElementById('btn-prev-q');
  if (prevBtn) {
    prevBtn.style.display = currentQuestionIdx > 0 ? 'inline-block' : 'none';
  }

  const imgBox = document.getElementById('q-image-container');
  imgBox.innerHTML = q.image ? `<img src="${q.image}" alt="Clinical vignette">` : '';

  const optBox = document.getElementById('q-options-container');
  optBox.innerHTML = '';

  q.options.forEach((optText, optIdx) => {
    const isChecked = qState.selectedOption === optIdx ? 'checked' : '';
    optBox.innerHTML += `
      <label class="cbt-option">
        <input type="radio" name="cbt-opt" value="${optIdx}" ${isChecked}>
        <span>${optText}</span>
      </label>
    `;
  });

  renderPalette();
}

function renderPalette() {
  const sec = examData.sections[currentSectionIdx];
  const grid = document.getElementById('palette-button-grid');
  grid.innerHTML = '';

  let cAns = 0;
  let cNotAns = 0;
  let cNotVis = 0;
  let cRev = 0;
  let cRevAns = 0;

  sec.questions.forEach((q, idx) => {
    const qState = state.responses[q.id];
    let shapeClass = 'shape-not-visited';

    if (qState.status === 'ANSWERED') {
      shapeClass = 'shape-answered';
      cAns++;
    } else if (qState.status === 'NOT_ANSWERED') {
      shapeClass = 'shape-not-answered';
      cNotAns++;
    } else if (qState.status === 'REVIEW') {
      shapeClass = 'shape-review';
      cRev++;
    } else if (qState.status === 'REVIEW_ANSWERED') {
      shapeClass = 'shape-review-ans';
      cRevAns++;
    } else {
      cNotVis++;
    }

    const activeClass = idx === currentQuestionIdx ? 'active-q-btn' : '';
    grid.innerHTML += `
      <button class="pal-q-btn ${shapeClass} ${activeClass}" onclick="goToQuestion(${idx})">
        ${idx + 1}
      </button>
    `;
  });

  document.getElementById('count-ans').innerText = cAns;
  document.getElementById('count-notans').innerText = cNotAns;
  document.getElementById('count-notvis').innerText = cNotVis;
  document.getElementById('count-rev').innerText = cRev;
  document.getElementById('count-revans').innerText = cRevAns;
}

window.goToQuestion = function(idx) {
  currentQuestionIdx = idx;
  renderCurrentQuestion();
  saveSessionState();

  /* Close drawer on mobile selection */
  const paletteDrawer = document.querySelector('.cbt-side-palette');
  const paletteBackdrop = document.getElementById('palette-backdrop');
  if (paletteDrawer) paletteDrawer.classList.remove('open');
  if (paletteBackdrop) paletteBackdrop.classList.remove('active');
};

function handleSaveAndNext() {
  const selected = document.querySelector('input[name="cbt-opt"]:checked');
  const q = getCurrentQuestion();

  if (selected) {
    state.responses[q.id].selectedOption = parseInt(selected.value, 10);
    state.responses[q.id].status = 'ANSWERED';
  } else {
    state.responses[q.id].status = 'NOT_ANSWERED';
  }

  advanceNextQuestion();
  saveSessionState();
}

function handleMarkForReviewAndNext() {
  const selected = document.querySelector('input[name="cbt-opt"]:checked');
  const q = getCurrentQuestion();

  if (selected) {
    state.responses[q.id].selectedOption = parseInt(selected.value, 10);
    state.responses[q.id].status = 'REVIEW_ANSWERED';
  } else {
    state.responses[q.id].status = 'REVIEW';
  }

  advanceNextQuestion();
  saveSessionState();
}

function handleClearResponse() {
  const q = getCurrentQuestion();
  state.responses[q.id].selectedOption = null;
  state.responses[q.id].status = 'NOT_ANSWERED';

  renderCurrentQuestion();
  saveSessionState();
}

function handlePreviousQuestion() {
  if (currentQuestionIdx > 0) {
    currentQuestionIdx--;
    renderCurrentQuestion();
    saveSessionState();
  }
}

function advanceNextQuestion() {
  const totalInSec = examData.sections[currentSectionIdx].questions.length;
  currentQuestionIdx = currentQuestionIdx < totalInSec - 1 ? currentQuestionIdx + 1 : 0;

  renderCurrentQuestion();
  saveSessionState();
}

/* ==========================================================================
   Exam Summary, Analytics & Review
   ========================================================================== */

function showExamSummary() {
  isExamActive = false;
  sessionStorage.removeItem('cbt_active_exam');
  showScreen('view-summary');

  const host = document.getElementById('summary-tables-host');
  host.innerHTML = '';

  examData.sections.forEach((sec) => {
    let ans = 0;
    let notAns = 0;
    let rev = 0;
    let revAns = 0;
    let notVis = 0;

    sec.questions.forEach((q) => {
      const st = state.responses[q.id].status;
      if (st === 'ANSWERED') ans++;
      else if (st === 'NOT_ANSWERED') notAns++;
      else if (st === 'REVIEW') rev++;
      else if (st === 'REVIEW_ANSWERED') revAns++;
      else notVis++;
    });

    host.innerHTML += `
      <div class="summary-sec-block">
        <div class="summary-sec-title">${sec.name} :</div>
        <div class="table-responsive-wrapper">
          <table class="summary-table">
            <thead>
              <tr>
                <th>Section Name</th>
                <th>No. of Questions</th>
                <th>Answered</th>
                <th>Not Answered</th>
                <th>Marked for Review</th>
                <th>Answered & Marked for Review</th>
                <th>Not Visited</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${sec.name}</td>
                <td>${sec.questions.length}</td>
                <td>${ans}</td>
                <td>${notAns}</td>
                <td>${rev}</td>
                <td>${revAns}</td>
                <td>${notVis}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  });
}

function renderAnalytics() {
  isExamActive = false;
  sessionStorage.removeItem('cbt_active_exam');
  showScreen('view-analytics');

  let score = 0;
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  let total = 0;

  examData.sections.forEach((sec) => {
    sec.questions.forEach((q) => {
      total++;
      const resp = state.responses[q.id];
      const hasAns = resp && resp.selectedOption !== null && resp.selectedOption !== undefined;

      if (hasAns) {
        if (resp.selectedOption === q.correctAnswer) {
          correct++;
          score += 4;
        } else {
          wrong++;
          score -= 1;
        }
      } else {
        unattempted++;
      }
    });
  });

  const accuracy = correct + wrong > 0 ? ((correct / (correct + wrong)) * 100).toFixed(1) : 0;

  document.getElementById('res-total-score').innerText = `${score} / ${total * 4}`;
  document.getElementById('res-accuracy').innerText = `${accuracy}%`;
  document.getElementById('res-correct').innerText = correct;
  document.getElementById('res-wrong').innerText = wrong;
  document.getElementById('res-unattempted').innerText = unattempted;

  activeReviewSecIdx = 0;
  renderReviewTabs();
  renderReviewQuestions(0);
}

function renderReviewTabs() {
  const tabsHost = document.getElementById('review-section-tabs');
  tabsHost.innerHTML = '';

  examData.sections.forEach((sec, idx) => {
    const btn = document.createElement('button');
    btn.className = `review-tab-btn ${idx === activeReviewSecIdx ? 'active' : ''}`;
    btn.innerText = sec.name;
    btn.onclick = () => {
      activeReviewSecIdx = idx;
      renderReviewTabs();
      renderReviewQuestions(idx);
    };
    tabsHost.appendChild(btn);
  });
}

function renderReviewQuestions(secIdx) {
  const sec = examData.sections[secIdx];
  const host = document.getElementById('analytics-question-review');
  host.innerHTML = '';

  sec.questions.forEach((q, qIndex) => {
    const resp = state.responses[q.id];
    const hasAns = resp && resp.selectedOption !== null && resp.selectedOption !== undefined;
    const isMarked = resp && (resp.status === 'REVIEW' || resp.status === 'REVIEW_ANSWERED');
    const isCorrect = hasAns && resp.selectedOption === q.correctAnswer;
    const statusClass = !hasAns ? 'unattempted' : isCorrect ? 'correct' : 'wrong';

    const bookmarkHtml = isMarked
      ? `<span class="review-bookmark" title="Marked for Review">
           <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
             <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
           </svg>
         </span>`
      : '';

    let optionsHtml = '<div class="review-options-list">';
    q.options.forEach((optText, optIdx) => {
      const isOptCorrect = optIdx === q.correctAnswer;
      const isUserChoice = hasAns && resp.selectedOption === optIdx;

      let optClass = 'review-opt';
      let markSymbol = '';

      if (isOptCorrect) {
        optClass += ' opt-correct';
        markSymbol = '<span class="opt-badge badge-tag-correct">✓</span>';
      } else if (isUserChoice) {
        optClass += ' opt-wrong-user';
        markSymbol = '<span class="opt-badge badge-tag-user-wrong">✗</span>';
      }

      optionsHtml += `
        <div class="${optClass}">
          <span><strong>${String.fromCharCode(65 + optIdx)}.</strong> ${optText}</span>
          <div class="opt-tags">${markSymbol}</div>
        </div>
      `;
    });
    optionsHtml += '</div>';

    const imgHtml = q.image
      ? `<div class="review-img-box"><img src="${q.image}" alt="Vignette Image"></div>`
      : '';

    host.innerHTML += `
      <div class="review-item ${statusClass}">
        <div class="review-header-strip">
          <p class="q-review-title"><strong>${qIndex + 1}.</strong> ${q.question}</p>
          <div class="review-meta-badges">
            ${bookmarkHtml}
          </div>
        </div>
        ${imgHtml}
        ${optionsHtml}
        <div class="review-exp"><strong>Explanation:</strong> ${q.explanation || 'No explanation available.'}</div>
      </div>
    `;
  });
}

/* ==========================================================================
   Utilities & External Integrations
   ========================================================================== */

function loadLastUpdatedCommit() {
  const GITHUB_USERNAME = 'pranavdeshai';
  const REPO_NAME = 'neet-pg-mock';

  fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/commits?per_page=1`)
    .then((res) => res.json())
    .then((commits) => {
      if (commits && commits.length > 0) {
        const commitDate = new Date(commits[0].commit.committer.date);
        const dateStr = commitDate.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
        const timeStr = commitDate.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        document.getElementById('footer-version').innerText = `Updated : ${dateStr} ${timeStr}`;
      }
    })
    .catch(() => {
      document.getElementById('footer-version').innerText = `Updated : ${new Date().toLocaleDateString('en-IN')}`;
    });
}
