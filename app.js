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
    tab.innerText = `${sec.name}`;     tabsContainer.appendChild(tab);   });   document.getElementById('active-sec-tag').innerText = `${examData.sections[currentSectionIdx].name}`;
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

let activeReviewSecIdx = 0;

function renderAnalytics() {
  showScreen('view-analytics');
  let score = 0, correct = 0, wrong = 0, unattempted = 0, total = 0;

  examData.sections.forEach(sec => {
    sec.questions.forEach(q => {
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

  const accuracy = (correct + wrong) > 0 ? ((correct / (correct + wrong)) * 100).toFixed(1) : 0;
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
    let isCorrect = false;

    if (hasAns) {
      isCorrect = (resp.selectedOption === q.correctAnswer);
    }

    const statusClass = !hasAns ? 'unattempted' : isCorrect ? 'correct' : 'wrong';
    const scoreBadge = !hasAns 
      ? '<span class="status-tag tag-skipped">0</span>' 
      : isCorrect 
        ? '<span class="status-tag tag-correct">+4</span>' 
        : '<span class="status-tag tag-wrong">-1</span>';

    const bookmarkHtml = isMarked
      ? `<span class="review-bookmark" title="Marked for Review">
           <svg viewBox="0 0 24 24" width="13" height="13" fill="#684693">
             <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
           </svg>
         </span>`
      : '';

    // Options list with clean ✓ and ✗
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

    const imgHtml = q.image ? `<div class="review-img-box"><img src="${q.image}" alt="Vignette Image"></div>` : '';

    host.innerHTML += `
      <div class="review-item ${statusClass}">
        <div class="review-header-strip">
          <p class="q-review-title"><strong>${qIndex + 1}.</strong> ${q.question}</p>
          <div class="review-meta-badges">
            ${bookmarkHtml}
            ${scoreBadge}
          </div>
        </div>
        ${imgHtml}
        ${optionsHtml}
        <div class="review-exp"><strong>Explanation:</strong> ${q.explanation || 'No explanation available.'}</div>
      </div>
    `;
  });
}

// Show updated date and time instead of version
const GITHUB_USERNAME = 'pranavdeshai';
const REPO_NAME = 'neet-pg-mock';

fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${REPO_NAME}/commits?per_page=1`)
  .then(response => response.json())
  .then(commits => {
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
    // Fallback if API rate-limited or offline
    document.getElementById('footer-version').innerText = `Updated : ${new Date().toLocaleDateString('en-IN')}`;
  });
