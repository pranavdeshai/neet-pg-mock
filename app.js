/* State & Configuration */
let examData = null;
let currentSectionIdx = 0;
let currentQuestionIdx = 0;
let sectionSecondsLeft = 0;
let timerInterval = null;
let isExamActive = false;
let candidateName = 'John Smith';
let analyticsCache = null;

const state = { responses: {} };

const reviewFilters = {
  section: 'ALL',
  status: 'ALL',
  marked: 'ALL',
  subject: 'ALL',
  system: 'ALL',
  format: 'ALL',
  difficulty: 'ALL',
  trap: 'ALL',
  switchType: 'ALL'
};

/* Lifecycle & Persistence */
window.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  fetch('questions.json')
    .then((res) => res.json())
    .then((data) => {
      examData = data;
      initData();
    })
    .catch((err) => console.error('Error loading questions.json:', err));
});

window.addEventListener('beforeunload', (e) => {
  if (isExamActive) e.preventDefault();
});

function initData() {
  let totalQ = 0;
  examData.sections.forEach((sec) => {
    sec.questions.forEach((q) => {
      totalQ++;
      state.responses[q.id] = {
        selectedOption: null,
        status: 'NOT_VISITED',
        timeSpent: 0,
        selectionHistory: [],
        switchCount: 0
      };
    });
  });

  const totalElem = document.getElementById('table-total-q');
  if (totalElem) totalElem.innerText = totalQ;

  setupScreenTransitions();
  loadLastUpdatedCommit();
  restoreSavedSession();
}

function setupTheme() {
  const globalBtn = document.getElementById('global-theme-btn');
  const savedTheme = sessionStorage.getItem('cbt-theme') || 'light';

  function applyTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    if (globalBtn) globalBtn.innerText = isDark ? 'Light Mode' : 'Dark Mode';
  }

  function toggle() {
    const isDark = document.body.classList.toggle('dark-mode');
    sessionStorage.setItem('cbt-theme', isDark ? 'dark' : 'light');
    applyTheme(isDark);
  }

  applyTheme(savedTheme === 'dark');
  if (globalBtn) globalBtn.onclick = toggle;
}

function saveSessionState() {
  if (!isExamActive) return;
  sessionStorage.setItem(
    'cbt_active_exam',
    JSON.stringify({
      candidateName,
      currentSectionIdx,
      currentQuestionIdx,
      sectionSecondsLeft,
      responses: state.responses
    })
  );
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
  } catch {
    sessionStorage.removeItem('cbt_active_exam');
  }
}

/* UI Transitions & Navigation */
function showScreen(screenId) {
  document.querySelectorAll('.screen-view').forEach((el) => (el.style.display = 'none'));
  document.getElementById(screenId).style.display = 'block';
}

function updateCandidateName(newName) {
  candidateName = newName.trim() || 'John Smith';
  document.querySelectorAll('.disp-cand-name').forEach((el) => (el.innerText = candidateName));
}

function setupScreenTransitions() {
  document.getElementById('btn-login').onclick = () => {
    updateCandidateName(document.getElementById('login-username').value);
    saveSessionState();
    showScreen('view-instructions-1');
  };

  document.getElementById('btn-inst-next').onclick = () => showScreen('view-instructions-2');
  document.getElementById('btn-inst-prev').onclick = () => showScreen('view-instructions-1');

  const declCheck = document.getElementById('decl-check');
  declCheck.onchange = () => {
    document.getElementById('btn-ready-begin').disabled = !declCheck.checked;
  };

  document.getElementById('btn-ready-begin').onclick = () => {
    isExamActive = true;
    showScreen('view-exam');
    startSection(0);
  };

  document.getElementById('btn-save-next').onclick = handleSaveAndNext;
  document.getElementById('btn-mark-review').onclick = handleMarkForReviewAndNext;
  document.getElementById('btn-clear-response').onclick = handleClearResponse;
  document.getElementById('btn-prev-q').onclick = handlePreviousQuestion;

  document.getElementById('btn-submit-exam').onclick = () => {
    if (confirm('Are you sure you want to submit the examination? Answers cannot be modified later.')) {
      clearInterval(timerInterval);
      showExamSummary();
    }
  };

  document.getElementById('btn-summary-next').onclick = () => showScreen('view-exit');
  document.getElementById('btn-exit-exam').onclick = renderAnalytics;

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

/* Exam Section & Timer */
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

    const curQ = getCurrentQuestion();
    if (curQ && state.responses[curQ.id]) {
      state.responses[curQ.id].timeSpent = (state.responses[curQ.id].timeSpent || 0) + 1;
    }

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
  let ans = 0, notAns = 0, rev = 0, revAns = 0, notVis = 0;
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
          <div class="popup-row"><span class="shape-answered p-mini-shape"></span><span>Answered</span><strong>${stats.ans}</strong></div>
          <div class="popup-row"><span class="shape-not-answered p-mini-shape"></span><span>Not Answered</span><strong>${stats.notAns}</strong></div>
          <div class="popup-row"><span class="shape-review p-mini-shape"></span><span>Marked for Review</span><strong>${stats.rev}</strong></div>
          <div class="popup-row"><span class="shape-review-ans p-mini-shape"></span><span>Ans & Marked</span><strong>${stats.revAns}</strong></div>
          <div class="popup-row"><span class="shape-not-visited p-mini-shape"></span><span>Not Visited</span><strong>${stats.notVis}</strong></div>
        </div>
      `;
    };

    tabsContainer.appendChild(tab);
  });

  document.getElementById('active-sec-tag').innerText = examData.sections[currentSectionIdx].name;
  document.getElementById('pal-sec-name').innerText = examData.sections[currentSectionIdx].name;
}

/* Question Workspace & Palette */
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
  if (prevBtn) prevBtn.style.display = currentQuestionIdx > 0 ? 'inline-block' : 'none';

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

  let cAns = 0, cNotAns = 0, cNotVis = 0, cRev = 0, cRevAns = 0;

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

  const paletteDrawer = document.querySelector('.cbt-side-palette');
  const paletteBackdrop = document.getElementById('palette-backdrop');
  if (paletteDrawer) paletteDrawer.classList.remove('open');
  if (paletteBackdrop) paletteBackdrop.classList.remove('active');
};

function recordSelection(qId, selectedVal) {
  const qState = state.responses[qId];
  if (!qState.selectionHistory) qState.selectionHistory = [];

  const prev = qState.selectedOption;
  if (selectedVal !== null && prev !== null && prev !== selectedVal) {
    qState.switchCount = (qState.switchCount || 0) + 1;
    qState.selectionHistory.push(prev);
  }
  qState.selectedOption = selectedVal;
}

function handleSaveAndNext() {
  const selected = document.querySelector('input[name="cbt-opt"]:checked');
  const q = getCurrentQuestion();
  if (selected) {
    recordSelection(q.id, parseInt(selected.value, 10));
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
    recordSelection(q.id, parseInt(selected.value, 10));
    state.responses[q.id].status = 'REVIEW_ANSWERED';
  } else {
    state.responses[q.id].status = 'REVIEW';
  }
  advanceNextQuestion();
  saveSessionState();
}

function handleClearResponse() {
  const q = getCurrentQuestion();
  const prev = state.responses[q.id].selectedOption;
  if (prev !== null) {
    state.responses[q.id].selectionHistory.push(prev);
    state.responses[q.id].switchCount = (state.responses[q.id].switchCount || 0) + 1;
  }
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

/* Exam Summary */
function showExamSummary() {
  isExamActive = false;
  sessionStorage.removeItem('cbt_active_exam');
  showScreen('view-summary');

  const host = document.getElementById('summary-tables-host');
  host.innerHTML = '';

  examData.sections.forEach((sec) => {
    let ans = 0, notAns = 0, rev = 0, revAns = 0, notVis = 0;
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

/* Question Metadata Normalization */
function normalizeTags(val) {
  if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
  if (typeof val === 'string' && val.trim().length > 0) return val.split(',').map((s) => s.trim()).filter(Boolean);
  return ['Unspecified'];
}

function getQuestionMeta(q) {
  return {
    subjects: normalizeTags(q.subject),
    systems: normalizeTags(q.system),
    format: q.format || 'One-Liner / Recall',
    difficulty: q.difficulty || 'Medium'
  };
}

/* Analytics & Metric Processing */
function renderAnalytics() {
  isExamActive = false;
  sessionStorage.removeItem('cbt_active_exam');
  showScreen('view-analytics');

  let score = 0, correct = 0, wrong = 0, unattempted = 0, total = 0;
  let totalTime = 0, correctTime = 0, wrongTime = 0, unattemptedTime = 0;
  let rushedMistakes = 0, timeSinks = 0;
  let totalSwitchedQ = 0, switchWrongToRight = 0, switchRightToWrong = 0, switchWrongToWrong = 0;

  const sectionMap = {};
  const subjectMap = {};
  const systemMap = {};
  const formatMap = {};
  const difficultyMap = {};
  const allQuestionsFlat = [];
  let globalQCounter = 0;

  function aggregateMulti(map, keys, isC, isW) {
    keys.forEach((key) => {
      if (!map[key]) map[key] = { total: 0, correct: 0, wrong: 0, unattempted: 0, score: 0 };
      map[key].total++;
      if (isC) { map[key].correct++; map[key].score += 4; }
      else if (isW) { map[key].wrong++; map[key].score -= 1; }
      else map[key].unattempted++;
    });
  }

  function aggregateSingle(map, key, isC, isW, timeSpent = 0) {
    if (!map[key]) map[key] = { total: 0, correct: 0, wrong: 0, unattempted: 0, score: 0, timeSpent: 0 };
    map[key].total++;
    map[key].timeSpent += timeSpent;
    if (isC) { map[key].correct++; map[key].score += 4; }
    else if (isW) { map[key].wrong++; map[key].score -= 1; }
    else map[key].unattempted++;
  }

  examData.sections.forEach((sec) => {
    sec.questions.forEach((q, qIdx) => {
      total++;
      globalQCounter++;
      const resp = state.responses[q.id] || { selectedOption: null, status: 'NOT_VISITED', timeSpent: 0 };
      const hasAns = resp.selectedOption !== null && resp.selectedOption !== undefined;
      const isCorrect = hasAns && resp.selectedOption === q.correctAnswer;
      const isWrong = hasAns && resp.selectedOption !== q.correctAnswer;

      const tSpent = resp.timeSpent || 0;
      totalTime += tSpent;

      if (isCorrect) { correct++; score += 4; correctTime += tSpent; }
      else if (isWrong) { wrong++; score -= 1; wrongTime += tSpent; }
      else { unattempted++; unattemptedTime += tSpent; }

      let trapType = 'NONE';
      if (isWrong && tSpent <= 20) { rushedMistakes++; trapType = 'RUSHED'; }
      if (tSpent >= 90) { timeSinks++; trapType = trapType === 'RUSHED' ? 'RUSHED' : 'SINK'; }

      let switchOutcome = 'NONE';
      const hist = resp.selectionHistory || [];
      const switches = resp.switchCount || 0;
      if (switches > 0 && hist.length > 0) {
        totalSwitchedQ++;
        const firstChoice = hist[0];
        const finalChoice = resp.selectedOption;
        const firstWasCorrect = firstChoice === q.correctAnswer;
        const finalIsCorrect = finalChoice === q.correctAnswer;

        if (!firstWasCorrect && finalIsCorrect) { switchWrongToRight++; switchOutcome = 'WRONG_TO_RIGHT'; }
        else if (firstWasCorrect && !finalIsCorrect) { switchRightToWrong++; switchOutcome = 'RIGHT_TO_WRONG'; }
        else { switchWrongToWrong++; switchOutcome = 'WRONG_TO_WRONG'; }
      }

      const meta = getQuestionMeta(q);
      q._meta = meta;

      aggregateSingle(sectionMap, sec.name, isCorrect, isWrong, tSpent);
      aggregateMulti(subjectMap, meta.subjects, isCorrect, isWrong);
      aggregateMulti(systemMap, meta.systems, isCorrect, isWrong);
      aggregateSingle(formatMap, meta.format, isCorrect, isWrong);
      aggregateSingle(difficultyMap, meta.difficulty, isCorrect, isWrong);

      allQuestionsFlat.push({
        id: q.id,
        secName: sec.name,
        qIndex: qIdx + 1,
        qGlobalIndex: globalQCounter,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        selectedOption: resp.selectedOption,
        status: resp.status,
        explanation: q.explanation,
        timeSpent: tSpent,
        meta,
        isCorrect,
        isWrong,
        isUnattempted: !hasAns,
        trapType,
        switchOutcome
      });
    });
  });

  const accuracy = correct + wrong > 0 ? ((correct / (correct + wrong)) * 100).toFixed(1) : 0;
  const avgTimePerQ = total > 0 ? (totalTime / total).toFixed(0) : 0;
  const avgTimeCorrect = correct > 0 ? (correctTime / correct).toFixed(0) : 0;
  const avgTimeWrong = wrong > 0 ? (wrongTime / wrong).toFixed(0) : 0;

  analyticsCache = {
    allQuestionsFlat,
    sectionMap,
    subjectMap,
    systemMap,
    formatMap,
    difficultyMap,
    score,
    accuracy,
    correct,
    wrong,
    unattempted,
    total
  };

  document.getElementById('res-total-score').innerText = `${score} / ${total * 4}`;
  document.getElementById('res-accuracy').innerText = `${accuracy}%`;
  document.getElementById('res-correct').innerText = correct;
  document.getElementById('res-wrong').innerText = wrong;
  document.getElementById('res-unattempted').innerText = unattempted;

  populateFilterDropdowns(sectionMap, subjectMap, systemMap);
  renderSectionBreakdown(sectionMap);
  renderSubjectBreakdown(subjectMap);
  renderSystemBreakdown(systemMap);
  renderTimeAndBehaviorMetrics({
    avgTimePerQ,
    avgTimeCorrect,
    avgTimeWrong,
    rushedMistakes,
    timeSinks,
    totalSwitchedQ,
    switchWrongToRight,
    switchRightToWrong,
    switchWrongToWrong
  });
  renderQuestionProfiling(formatMap, difficultyMap);

  resetReviewFilters();
  switchAnalyticsTab('pane-questions');
}

/* Sidebar & Navigation Actions */
window.switchAnalyticsTab = function(paneId) {
  document.querySelectorAll('.analytics-pane').forEach((p) => {
    p.hidden = true;
    p.classList.remove('active');
  });

  document.querySelectorAll('.analytics-nav-btn').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-pane') === paneId);
  });

  const activePane = document.getElementById(paneId);
  if (activePane) {
    activePane.hidden = false;
    activePane.classList.add('active');
  }
};

function applySingleFilterAndNavigate(key, val) {
  resetReviewFiltersState();
  reviewFilters[key] = val;
  syncFilterControls();
  filterAndRenderQuestions();
  switchAnalyticsTab('pane-questions');
}

window.filterBySection = (sec) => applySingleFilterAndNavigate('section', sec);
window.filterBySubject = (sub) => applySingleFilterAndNavigate('subject', sub);
window.filterBySystem = (sys) => applySingleFilterAndNavigate('system', sys);
window.filterByFormat = (fmt) => applySingleFilterAndNavigate('format', fmt);
window.filterByDifficulty = (diff) => applySingleFilterAndNavigate('difficulty', diff);
window.filterByTrap = (trap) => applySingleFilterAndNavigate('trap', trap);
window.filterBySwitch = (sw) => applySingleFilterAndNavigate('switchType', sw);

/* Filters & Question List */
function populateFilterDropdowns(sectionMap, subjectMap, systemMap) {
  const secSelect = document.getElementById('filter-section');
  const subSelect = document.getElementById('filter-subject');
  const sysSelect = document.getElementById('filter-system');

  if (secSelect) {
    secSelect.innerHTML = '<option value="ALL">All Sections</option>';
    Object.keys(sectionMap).forEach((sec) => {
      secSelect.innerHTML += `<option value="${sec}">${sec} (${sectionMap[sec].total})</option>`;
    });
  }

  if (subSelect) {
    subSelect.innerHTML = '<option value="ALL">All Subjects</option>';
    Object.keys(subjectMap).sort().forEach((sub) => {
      subSelect.innerHTML += `<option value="${sub}">${sub} (${subjectMap[sub].total})</option>`;
    });
  }

  if (sysSelect) {
    sysSelect.innerHTML = '<option value="ALL">All Systems</option>';
    Object.keys(systemMap).sort().forEach((sys) => {
      sysSelect.innerHTML += `<option value="${sys}">${sys} (${systemMap[sys].total})</option>`;
    });
  }
}

function resetReviewFiltersState() {
  reviewFilters.section = 'ALL';
  reviewFilters.status = 'ALL';
  reviewFilters.marked = 'ALL';
  reviewFilters.subject = 'ALL';
  reviewFilters.system = 'ALL';
  reviewFilters.format = 'ALL';
  reviewFilters.difficulty = 'ALL';
  reviewFilters.trap = 'ALL';
  reviewFilters.switchType = 'ALL';
}

window.resetReviewFilters = function() {
  resetReviewFiltersState();
  syncFilterControls();
  filterAndRenderQuestions();
};

function updateFilterVisuals() {
  const filterMappings = [
    { id: 'filter-section', groupId: 'group-filter-section', val: reviewFilters.section },
    { id: 'filter-status', groupId: 'group-filter-status', val: reviewFilters.status },
    { id: 'filter-marked', groupId: 'group-filter-marked', val: reviewFilters.marked },
    { id: 'filter-subject', groupId: 'group-filter-subject', val: reviewFilters.subject },
    { id: 'filter-system', groupId: 'group-filter-system', val: reviewFilters.system },
    { id: 'filter-format', groupId: 'group-filter-format', val: reviewFilters.format }
  ];

  filterMappings.forEach(({ id, groupId, val }) => {
    const selEl = document.getElementById(id);
    const grpEl = document.getElementById(groupId);
    if (selEl) selEl.classList.toggle('filter-active', val !== 'ALL');
    if (grpEl) grpEl.classList.toggle('has-active-filter', val !== 'ALL');
  });

  const isAnyFilterActive =
    reviewFilters.section !== 'ALL' ||
    reviewFilters.status !== 'ALL' ||
    reviewFilters.marked !== 'ALL' ||
    reviewFilters.subject !== 'ALL' ||
    reviewFilters.system !== 'ALL' ||
    reviewFilters.format !== 'ALL' ||
    reviewFilters.difficulty !== 'ALL' ||
    reviewFilters.trap !== 'ALL' ||
    reviewFilters.switchType !== 'ALL';

  const resetBtn = document.getElementById('btn-reset-filters');
  if (resetBtn) {
    resetBtn.disabled = !isAnyFilterActive;
    resetBtn.classList.toggle('active', isAnyFilterActive);
  }
}

function syncFilterControls() {
  const secEl = document.getElementById('filter-section');
  const statusEl = document.getElementById('filter-status');
  const markedEl = document.getElementById('filter-marked');
  const subEl = document.getElementById('filter-subject');
  const sysEl = document.getElementById('filter-system');
  const fmtEl = document.getElementById('filter-format');

  if (secEl) secEl.value = reviewFilters.section;
  if (statusEl) statusEl.value = reviewFilters.status;
  if (markedEl) markedEl.value = reviewFilters.marked;
  if (subEl) subEl.value = reviewFilters.subject;
  if (sysEl) sysEl.value = reviewFilters.system;
  if (fmtEl) fmtEl.value = reviewFilters.format;

  updateFilterVisuals();
}

window.onFilterChange = function(filterKey, value) {
  reviewFilters[filterKey] = value;
  updateFilterVisuals();
  filterAndRenderQuestions();
};

function filterAndRenderQuestions() {
  if (!analyticsCache || !analyticsCache.allQuestionsFlat) return;

  const host = document.getElementById('analytics-question-review');
  const countLabel = document.getElementById('filtered-count-label');
  if (!host) return;

  const filtered = analyticsCache.allQuestionsFlat.filter((q) => {
    if (reviewFilters.section !== 'ALL' && q.secName !== reviewFilters.section) return false;
    if (reviewFilters.status === 'CORRECT' && !q.isCorrect) return false;
    if (reviewFilters.status === 'WRONG' && !q.isWrong) return false;
    if (reviewFilters.status === 'UNATTEMPTED' && !q.isUnattempted) return false;
    if (reviewFilters.marked === 'MARKED' && q.status !== 'REVIEW' && q.status !== 'REVIEW_ANSWERED') return false;
    if (reviewFilters.subject !== 'ALL' && !q.meta.subjects.includes(reviewFilters.subject)) return false;
    if (reviewFilters.system !== 'ALL' && !q.meta.systems.includes(reviewFilters.system)) return false;
    if (reviewFilters.format !== 'ALL' && q.meta.format !== reviewFilters.format) return false;
    if (reviewFilters.difficulty !== 'ALL' && q.meta.difficulty !== reviewFilters.difficulty) return false;
    if (reviewFilters.trap !== 'ALL' && q.trapType !== reviewFilters.trap) return false;
    if (reviewFilters.switchType !== 'ALL' && q.switchOutcome !== reviewFilters.switchType) return false;
    return true;
  });

  if (countLabel) {
    countLabel.innerText = `Showing ${filtered.length} of ${analyticsCache.allQuestionsFlat.length} questions`;
  }

  if (filtered.length === 0) {
    host.innerHTML = `
      <div class="empty-filter-state">
        <p>No questions match the selected filter combination.</p>
        <button onclick="resetReviewFilters()" class="btn-default margin-top-12">Clear Filters</button>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach((q) => {
    const isMarked = q.status === 'REVIEW' || q.status === 'REVIEW_ANSWERED';
    const statusClass = q.isUnattempted ? 'unattempted' : q.isCorrect ? 'correct' : 'wrong';

    const bookmarkHtml = isMarked
      ? `<span class="review-bookmark" title="Marked for Review">
           <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
             <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
           </svg>
           Marked
         </span>`
      : '';

    let optionsHtml = '<div class="review-options-list">';
    q.options.forEach((optText, optIdx) => {
      const isOptCorrect = optIdx === q.correctAnswer;
      const isUserChoice = !q.isUnattempted && q.selectedOption === optIdx;

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

    const imgHtml = q.image ? `<div class="review-img-box"><img src="${q.image}" alt="Vignette Image"></div>` : '';
    const sectionPill = `<span class="meta-tag-pill neutral-pill" onclick="filterBySection('${q.secName}')">${q.secName}</span>`;
    const subjectPills = q.meta.subjects.map((sub) => `<span class="meta-tag-pill" onclick="filterBySubject('${sub}')">${sub}</span>`).join('');
    const systemPills = q.meta.systems.map((sys) => `<span class="meta-tag-pill sys-pill" onclick="filterBySystem('${sys}')">${sys}</span>`).join('');
    const formatPill = `<span class="meta-tag-pill neutral-pill" onclick="filterByFormat('${q.meta.format}')">${q.meta.format}</span>`;
    const difficultyPill = `<span class="meta-tag-pill neutral-pill" onclick="filterByDifficulty('${q.meta.difficulty}')">${q.meta.difficulty}</span>`;

    html += `
      <div class="review-item ${statusClass}">
        <div class="review-header-strip">
          <p class="q-review-title"><strong>${q.qGlobalIndex}.</strong> ${q.question}</p>
          <div class="review-meta-badges">${bookmarkHtml}</div>
        </div>
        ${imgHtml}
        ${optionsHtml}
        <div class="review-exp"><strong>Explanation:</strong> ${q.explanation || 'No explanation available.'}</div>
        <div class="review-card-footer">
          <div class="card-footer-tags">
            ${sectionPill}
            ${subjectPills}
            ${systemPills}
            ${formatPill}
            ${difficultyPill}
          </div>
        </div>
      </div>
    `;
  });

  host.innerHTML = html;
}

/* Breakdown Views */
function renderSectionBreakdown(sectionMap) {
  const secHost = document.getElementById('analytics-section-breakdown');
  if (!secHost) return;

  let secHtml = `
    <div class="table-responsive-wrapper">
      <table class="analytics-datatable">
        <thead>
          <tr>
            <th>Section</th>
            <th>Questions</th>
            <th>Attempted</th>
            <th>Correct</th>
            <th>Accuracy</th>
            <th>Net Score</th>
            <th>Time Spent</th>
          </tr>
        </thead>
        <tbody>
  `;

  Object.keys(sectionMap).forEach((sec) => {
    const d = sectionMap[sec];
    const att = d.correct + d.wrong;
    const acc = att > 0 ? ((d.correct / att) * 100).toFixed(1) : 0;
    const badgeClass = acc >= 70 ? 'acc-high' : acc >= 45 ? 'acc-med' : 'acc-low';
    const m = Math.floor(d.timeSpent / 60);
    const s = d.timeSpent % 60;

    secHtml += `
      <tr class="clickable-row" onclick="filterBySection('${sec}')" title="Click to view ${sec} questions">
        <td><strong>${sec}</strong></td>
        <td>${d.total}</td>
        <td>${att}</td>
        <td>${d.correct}</td>
        <td><span class="acc-badge ${badgeClass}">${acc}%</span></td>
        <td><strong>${d.score}</strong></td>
        <td>${m}m ${s}s</td>
      </tr>
    `;
  });

  secHtml += `</tbody></table></div>`;
  secHost.innerHTML = secHtml;
}

function renderSubjectBreakdown(subjectMap) {
  const subHost = document.getElementById('analytics-subject-breakdown');
  if (!subHost) return;

  let subHtml = `
    <div class="table-responsive-wrapper">
      <table class="analytics-datatable">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Questions</th>
            <th>Attempted</th>
            <th>Correct</th>
            <th>Accuracy</th>
            <th>Net Score</th>
          </tr>
        </thead>
        <tbody>
  `;

  Object.keys(subjectMap).sort().forEach((sub) => {
    const d = subjectMap[sub];
    const att = d.correct + d.wrong;
    const acc = att > 0 ? ((d.correct / att) * 100).toFixed(1) : 0;
    const badgeClass = acc >= 70 ? 'acc-high' : acc >= 45 ? 'acc-med' : 'acc-low';

    subHtml += `
      <tr class="clickable-row" onclick="filterBySubject('${sub}')" title="Click to view ${sub} questions">
        <td><strong>${sub}</strong></td>
        <td>${d.total}</td>
        <td>${att}</td>
        <td>${d.correct}</td>
        <td><span class="acc-badge ${badgeClass}">${acc}%</span></td>
        <td><strong>${d.score}</strong></td>
      </tr>
    `;
  });

  subHtml += `</tbody></table></div>`;
  subHost.innerHTML = subHtml;
}

function renderSystemBreakdown(systemMap) {
  const sysHost = document.getElementById('analytics-system-breakdown');
  if (!sysHost) return;

  let sysHtml = '<div class="system-pills-grid">';
  Object.keys(systemMap).sort().forEach((sys) => {
    const d = systemMap[sys];
    const att = d.correct + d.wrong;
    const acc = att > 0 ? ((d.correct / att) * 100).toFixed(0) : 0;
    const badgeClass = acc >= 70 ? 'pill-green' : acc >= 45 ? 'pill-yellow' : 'pill-red';

    sysHtml += `
      <div class="system-card ${badgeClass} clickable-card" onclick="filterBySystem('${sys}')" title="Click to view ${sys} questions">
        <div class="sys-title">${sys}</div>
        <div class="sys-metric">${d.correct}/${d.total} (${acc}% Acc)</div>
      </div>
    `;
  });
  sysHtml += '</div>';
  sysHost.innerHTML = sysHtml;
}

function renderTimeAndBehaviorMetrics(data) {
  const host = document.getElementById('analytics-time-behavior');
  if (!host) return;

  host.innerHTML = `
    <div class="deep-analytics-grid">
      <div class="analytics-subcard">
        <h4 class="subcard-title">Pace & Time Allocation</h4>
        <div class="metric-inline-row"><span>Avg Time / Question:</span><strong>${data.avgTimePerQ}s</strong></div>
        <div class="metric-inline-row"><span>Avg Time on Correct:</span><strong class="green-text">${data.avgTimeCorrect}s</strong></div>
        <div class="metric-inline-row"><span>Avg Time on Incorrect:</span><strong class="red-text">${data.avgTimeWrong}s</strong></div>
        <hr class="subcard-divider">
        <div class="trap-alert-box">
          <div class="trap-item clickable-trap" onclick="filterByTrap('RUSHED')" title="Click to view rushed mistakes">
            <span class="trap-tag trap-red">Rushed Mistakes (&le;20s)</span>
            <span class="trap-count"><strong>${data.rushedMistakes}</strong> questions</span>
          </div>
          <div class="trap-item clickable-trap" onclick="filterByTrap('SINK')" title="Click to view time sinks">
            <span class="trap-tag trap-orange">Time Sinks (&ge;90s)</span>
            <span class="trap-count"><strong>${data.timeSinks}</strong> questions</span>
          </div>
        </div>
      </div>

      <div class="analytics-subcard">
        <h4 class="subcard-title">Option Switching Behavior</h4>
        <div class="metric-inline-row"><span>Questions with Modified Answers:</span><strong>${data.totalSwitchedQ}</strong></div>
        <div class="switch-outcome-list">
          <div class="switch-row green-bg clickable-trap" onclick="filterBySwitch('WRONG_TO_RIGHT')" title="Click to view questions changed from wrong to correct">
            <span>Switched Incorrect &rarr; <strong>Correct</strong></span>
            <strong>+${data.switchWrongToRight}</strong>
          </div>
          <div class="switch-row red-bg clickable-trap" onclick="filterBySwitch('RIGHT_TO_WRONG')" title="Click to view questions changed from correct to wrong">
            <span>Switched Correct &rarr; <strong>Incorrect</strong></span>
            <strong>-${data.switchRightToWrong}</strong>
          </div>
          <div class="switch-row gray-bg clickable-trap" onclick="filterBySwitch('WRONG_TO_WRONG')" title="Click to view questions changed between incorrect choices">
            <span>Switched Incorrect &rarr; <strong>Incorrect</strong></span>
            <strong>${data.switchWrongToWrong}</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderQuestionProfiling(formatMap, diffMap) {
  const host = document.getElementById('analytics-question-profiling');
  if (!host) return;

  function buildTable(map, title, filterFnName) {
    let html = `
      <div class="profiling-block">
        <h5 class="profiling-title">${title}</h5>
        <table class="analytics-datatable compact">
          <thead>
            <tr><th>Tier / Type</th><th>Total</th><th>Correct</th><th>Accuracy</th></tr>
          </thead>
          <tbody>
    `;
    Object.keys(map).forEach((k) => {
      const d = map[k];
      const att = d.correct + d.wrong;
      const acc = att > 0 ? ((d.correct / att) * 100).toFixed(1) : 0;
      html += `
        <tr class="clickable-row" onclick="${filterFnName}('${k}')" title="Click to view ${k} questions">
          <td><strong>${k}</strong></td>
          <td>${d.total}</td>
          <td>${d.correct}</td>
          <td>${acc}%</td>
        </tr>
      `;
    });
    html += `</tbody></table></div>`;
    return html;
  }

  host.innerHTML = `
    <div class="deep-analytics-grid">
      ${buildTable(formatMap, 'Question Format Profiling', 'filterByFormat')}
      ${buildTable(diffMap, 'Difficulty Tier Breakdown', 'filterByDifficulty')}
    </div>
  `;
}

/* Export Mistake Notebook */
window.downloadMistakeNotebook = function() {
  if (!analyticsCache || !analyticsCache.allQuestionsFlat) {
    alert('Please submit the exam to generate your mistake notebook.');
    return;
  }

  const mistakes = analyticsCache.allQuestionsFlat.filter(
    (q) => q.isWrong || q.status === 'REVIEW' || q.status === 'REVIEW_ANSWERED'
  );

  if (mistakes.length === 0) {
    alert('No mistakes or bookmarked questions found to export.');
    return;
  }

  let csvContent = 'data:text/csv;charset=utf-8,Section,Q No,Subjects,Systems,Question,Your Answer,Correct Answer,Status,Explanation\r\n';
  mistakes.forEach((m) => {
    const cleanQ = `"${(m.question || '').replace(/"/g, '""')}"`;
    const cleanExp = `"${(m.explanation || '').replace(/"/g, '""')}"`;
    const yourAnsText = m.selectedOption !== null && m.selectedOption !== undefined
      ? `"${(m.options[m.selectedOption] || '').replace(/"/g, '""')}"`
      : '"Unattempted"';
    const correctAnsText = `"${(m.options[m.correctAnswer] || '').replace(/"/g, '""')}"`;
    const stat = m.isWrong ? 'Incorrect' : m.isCorrect ? 'Correct (Bookmarked)' : 'Unattempted';
    const subjectsStr = `"${m.meta.subjects.join('; ')}"`;
    const systemsStr = `"${m.meta.systems.join('; ')}"`;

    csvContent += `"${m.secName}",${m.qGlobalIndex},${subjectsStr},${systemsStr},${cleanQ},${yourAnsText},${correctAnsText},"${stat}",${cleanExp}\r\n`;
  });

  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csvContent));
  link.setAttribute('download', `NEET_PG_Mistake_Notebook_${candidateName.replace(/\s+/g, '_')}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/* Version Stamp Integration */
function loadLastUpdatedCommit() {
  const GITHUB_USERNAME = 'pranavdeshai';
  const REPO_NAME = 'neet-pg-mock';

  fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/commits?per_page=1`)
    .then((res) => res.json())
    .then((commits) => {
      if (commits && commits.length > 0) {
        const commitDate = new Date(commits[0].commit.committer.date);
        const dateStr = commitDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = commitDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        document.getElementById('footer-version').innerText = `Updated : ${dateStr} ${timeStr}`;
      }
    })
    .catch(() => {
      document.getElementById('footer-version').innerText = `Updated : ${new Date().toLocaleDateString('en-IN')}`;
    });
}
