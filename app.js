let examData = null;
let currentSectionIdx = 0;
let currentQuestionIdx = 0;
let sectionSecondsLeft = 0;
let timerInterval = null;

// User state tracker
const state = {
  // [questionGlobalId]: { selectedOption: null, status: 'NOT_VISITED'|'NOT_ANSWERED'|'ANSWERED'|'REVIEW'|'REVIEW_ANSWERED' }
  responses: {}
};

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  fetch('questions.json')
    .then(res => res.json())
    .then(data => {
      examData = data;
      initData();
    })
    .catch(err => console.error("Error loading mock data", err));
});

function initData() {
  let totalQ = 0;
  examData.sections.forEach(sec => {
    sec.questions.forEach(q => {
      totalQ++;
      state.responses[q.id] = {
        selectedOption: null,
        status: 'NOT_VISITED'
      };
    });
  });
  document.getElementById('table-total-q').innerText = totalQ;
  setupScreenTransitions();
}

function showScreen(screenId) {
  document.querySelectorAll('.screen-view').forEach(el => el.style.display = 'none');
  document.getElementById(screenId).style.display = 'block';
}

function setupScreenTransitions() {
  // Login -> Instructions 1
  document.getElementById('btn-login').onclick = () => showScreen('view-instructions-1');

  // Instructions 1 -> Instructions 2
  document.getElementById('btn-inst-next').onclick = () => showScreen('view-instructions-2');
  document.getElementById('btn-inst-prev').onclick = () => showScreen('view-instructions-1');

  // Checkbox declaration
  const declCheck = document.getElementById('decl-check');
  const btnReady = document.getElementById('ready-begin', 'btn-ready-begin');
  declCheck.onchange = () => {
    document.getElementById('btn-ready-begin').disabled = !declCheck.checked;
  };

  // Ready -> Exam CBT
  document.getElementById('btn-ready-begin').onclick = () => {
    showScreen('view-exam');
    startSection(0);
  };

  // Exam CBT Actions
  document.getElementById('btn-save-next').onclick = () => handleSaveAndNext();
  document.getElementById('btn-mark-review').onclick = () => handleMarkForReviewAndNext();
  document.getElementById('btn-clear-response').onclick = () => handleClearResponse();
  document.getElementById('btn-submit-exam').onclick = () => confirmSubmitSection();

  // Summary -> Exit modal -> Scorecard
  document.getElementById('btn-summary-next').onclick = () => showScreen('view-exit');
  document.getElementById('btn-exit-exam').onclick = () => renderAnalytics();
}

function startSection(idx) {
  currentSectionIdx = idx;
  currentQuestionIdx = 0;
  sectionSecondsLeft = examData.sections[idx].durationMinutes * 60;

  // Set first question to NOT_ANSWERED if not visited
  const firstQ = examData.sections[idx].questions[0];
  if (state.responses[firstQ.id].status === 'NOT_VISITED') {
    state.responses[firstQ.id].status = 'NOT_ANSWERED';
  }

  renderSectionHeaders();
  renderPalette();
  renderCurrentQuestion();
  startTimer();
}

function renderSectionHeaders() {
  const tabsContainer = document.getElementById('cbt-sec-tab-list');
  tabsContainer.innerHTML = '';
  examData.sections.forEach((sec, idx) => {
    const tab = document.createElement('div');
    tab.className = `tab-pill ${idx === currentSectionIdx ? 'active' : ''}`;
    tab.innerText = `${sec.name} ℹ`;     tabsContainer.appendChild(tab);   });   document.getElementById('active-sec-tag').innerText = `${examData.sections[currentSectionIdx].name} ℹ`;
  document.getElementById('pal-sec-name').innerText = examData.sections[currentSectionIdx].name;
}

function startTimer() {
  clearInterval(timerInterval);
  updateTimerUI();
  timerInterval = setInterval(() => {
    sectionSecondsLeft--;
    updateTimerUI();
    if (sectionSecondsLeft <= 0) {
      clearInterval(timerInterval);
      proceedToNextSectionOrSummary(true);
    }
  }, 1000);
}

function updateTimerUI() {
  const m = String(Math.floor(sectionSecondsLeft / 60)).padStart(2, '0');
  const s = String(sectionSecondsLeft % 60).padStart(2, '0');
  document.getElementById('exam-timer').innerText = `${m}:${s}`;
}

function getCurrentQuestion() {
  return examData.sections[currentSectionIdx].questions[currentQuestionIdx];
}

function renderCurrentQuestion() {
  const q = getCurrentQuestion();
  const qState = state.responses[q.id];

  if (qState.status === 'NOT_VISITED') {
    qState.status = 'NOT_ANSWERED';
  }

  document.getElementById('q-number-title').innerText = `Question No. ${currentQuestionIdx + 1}`;   document.getElementById('q-statement').innerText = q.question;    // Image   const imgBox = document.getElementById('q-image-container');   imgBox.innerHTML = q.image ? `<img src="${q.image}" alt="Clinical vignette">` : '';

  // Options
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

    if (qState.status === 'ANSWERED') { shapeClass = 'shape-answered'; cAns++; }
    else if (qState.status === 'NOT_ANSWERED') { shapeClass = 'shape-not-answered'; cNotAns++; }
    else if (qState.status === 'REVIEW') { shapeClass = 'shape-review'; cRev++; }
    else if (qState.status === 'REVIEW_ANSWERED') { shapeClass = 'shape-review-ans'; cRevAns++; }
    else { cNotVis++; }

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
};

function handleSaveAndNext() {
  const selected = document.querySelector('input[name="cbt-opt"]:checked');
  const q = getCurrentQuestion();
  if (selected) {
    state.responses[q.id].selectedOption = parseInt(selected.value);
    state.responses[q.id].status = 'ANSWERED';
  } else {
    state.responses[q.id].status = 'NOT_ANSWERED';
  }
  advanceNextQuestion();
}

function handleMarkForReviewAndNext() {
  const selected = document.querySelector('input[name="cbt-opt"]:checked');
  const q = getCurrentQuestion();
  if (selected) {
    state.responses[q.id].selectedOption = parseInt(selected.value);
    state.responses[q.id].status = 'REVIEW_ANSWERED';
  } else {
    state.responses[q.id].status = 'REVIEW';
  }
  advanceNextQuestion();
}

function handleClearResponse() {
  const q = getCurrentQuestion();
  state.responses[q.id].selectedOption = null;
  state.responses[q.id].status = 'NOT_ANSWERED';
  renderCurrentQuestion();
}

function advanceNextQuestion() {
  const totalInSec = examData.sections[currentSectionIdx].questions.length;
  if (currentQuestionIdx < totalInSec - 1) {
    currentQuestionIdx++;
    renderCurrentQuestion();
  } else {
    renderPalette();
  }
}

function confirmSubmitSection() {
  if (confirm("Are you sure you want to submit this section? Once submitted, you cannot edit responses in this section.")) {
    proceedToNextSectionOrSummary(false);
  }
}

function proceedToNextSectionOrSummary(isAuto = false) {
  clearInterval(timerInterval);
  if (currentSectionIdx < examData.sections.length - 1) {
    startSection(currentSectionIdx + 1);
  } else {
    showExamSummary();
  }
}

function showExamSummary() {
  showScreen('view-summary');
  const host = document.getElementById('summary-tables-host');
  host.innerHTML = '';

  examData.sections.forEach(sec => {
    let ans = 0, notAns = 0, rev = 0, revAns = 0, notVis = 0;
    sec.questions.forEach(q => {
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
        <table class="summary-table">
          <thead>
            <tr>
              <th>Section Name</th>
              <th>No. of Questions</th>
              <th>Answered</th>
              <th>Not Answered</th>
              <th>Marked for Review</th>
              <th>Answered & Marked for Review (will also be evaluated)</th>
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
    `;
  });
}

function renderAnalytics() {
  showScreen('view-analytics');
  let score = 0, correct = 0, wrong = 0, unattempted = 0, total = 0;
  const reviewHost = document.getElementById('analytics-question-review');
  reviewHost.innerHTML = '<h3>Detailed Question Review</h3><br>';

  examData.sections.forEach(sec => {
    sec.questions.forEach(q => {
      total++;
      const resp = state.responses[q.id];
      const hasAns = resp.selectedOption !== null;
      let isCorrect = false;

      if (hasAns) {
        if (resp.selectedOption === q.correctAnswer) {
          correct++;
          score += 4;
          isCorrect = true;
        } else {
          wrong++;
          score -= 1;
        }
      } else {
        unattempted++;
      }

      const statusClass = !hasAns ? 'unattempted' : isCorrect ? 'correct' : 'wrong';
      const userChoiceText = hasAns ? q.options[resp.selectedOption] : 'None';
      const correctChoiceText = q.options[q.correctAnswer];

      reviewHost.innerHTML += `
        <div class="review-item ${statusClass}">
          <strong>${q.question}</strong>
          <div style="margin: 6px 0;">Your Choice: <strong>${userChoiceText}</strong> \vert{} Correct: <strong>${correctChoiceText}</strong></div>
          <div class="review-exp"><strong>Explanation:</strong> ${q.explanation || 'N/A'}</div>
        </div>
      `;
    });
  });

  const accuracy = (correct + wrong) > 0 ? ((correct / (correct + wrong)) * 100).toFixed(1) : 0;
  document.getElementById('res-total-score').innerText = `${score} /${total * 4}`;
  document.getElementById('res-accuracy').innerText = `${accuracy}%`;
  document.getElementById('res-correct').innerText = correct;
  document.getElementById('res-wrong').innerText = wrong;
  document.getElementById('res-unattempted').innerText = unattempted;
}
