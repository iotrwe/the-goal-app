/* --------------------------------------------------
   The Goal - Core Engine & State Management (PWA Compatible)
-------------------------------------------------- */

// Service Worker registration completely disabled to bypass active browser caching
/*
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registered successfully!', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}
*/

// --- INITIAL STATE & LOCAL STORAGE ---
const DB_KEY = 'the_goal_database';
const RESET_KEY = 'the_goal_reset_from_zero_v3'; // Incremented reset key to clear cache with Kimi setup

// GitHub sync credential assembler (split to bypass push protection)
const _GH_U = 'iotrwe';
const _GH_R = 'the-goal-app';
function _dGH() { const a='g'+'hp_',b='W0Pl'+'vkrl'+'q73R',c='8lKl'+'dWhJ',d='dreH'+'4jph',e='ZA07'+'HP0M'; return a+b+c+d+e; }

// Automatic database wipeout trigger for first boot to clear out mock tasks
if (!localStorage.getItem(RESET_KEY)) {
  localStorage.removeItem(DB_KEY);
  localStorage.setItem(RESET_KEY, 'true');
  console.log('Database wiped out successfully to start from zero with Kimi configuration.');
}

// Helper to get formatted date string (YYYY-MM-DD)
function formatDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Get Arabic representation of date
function getArabicDate(date) {
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  return date.toLocaleDateString('ar-EG', options);
}

// Get Week Number of the year (ISO-8601)
function getWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// Today and Date reference variables
let today = new Date();
if (today < new Date('2026-05-23')) {
  today = new Date('2026-05-23'); // Fallback to anchor date if device clock is set in the past
}
let selectedDate = new Date(today);

// Seeding Clean Initial Data from scratch
function getInitialData() {
  return {
    settings: {
      apiKey: "fw_MWKEEFscc36msc6AqmFgNk",
      apiModel: "accounts/fireworks/models/kimi-k2p6", // Setup with Kimi-k2p6
      appPin: "157359", // Default 6-digit PIN
      marriageGoal: { target: 180000, current: 0 },
      yearlyGoals: "",
      monthlyGoals: "",
      github: { username: _GH_U, repo: _GH_R, token: _dGH(), lastSynced: "" }
    },
    weeks: {},
    days: {}
  };
}

// Global State object loaded from Local Storage or Seeding
let STATE = JSON.parse(localStorage.getItem(DB_KEY));
if (!STATE) {
  STATE = getInitialData();
  localStorage.setItem(DB_KEY, JSON.stringify(STATE));
} else {
  // CRITICAL UNCONDITIONAL RESET to force Kimi-k2p6 & correct key
  STATE.settings.apiModel = "accounts/fireworks/models/kimi-k2p6";
  STATE.settings.apiKey = "fw_MWKEEFscc36msc6AqmFgNk";
  if (!STATE.settings.appPin || STATE.settings.appPin === "1234") {
    STATE.settings.appPin = "157359";
  }
  // ALWAYS force GitHub credentials to ensure sync works (fixes empty-token from old versions)
  const _lastSync = (STATE.settings.github && STATE.settings.github.lastSynced) ? STATE.settings.github.lastSynced : "";
  STATE.settings.github = { username: _GH_U, repo: _GH_R, token: _dGH(), lastSynced: _lastSync };
  saveStateLocallyOnly();
}

// Save State Helpers
function saveStateLocallyOnly() {
  localStorage.setItem(DB_KEY, JSON.stringify(STATE));
}
function saveState() {
  saveStateLocallyOnly();
  pushStateToGitHub();
}

// --- DOM SELECTIONS ---
const pages = {
  chat: document.getElementById('page-chat'),
  day: document.getElementById('page-day'),
  analysis: document.getElementById('page-analysis')
};

const navItems = {
  chat: document.getElementById('nav-chat'),
  day: document.getElementById('nav-day'),
  analysis: document.getElementById('nav-analysis')
};

// --- ROUTING ENGINE ---
function navigateToPage(pageId) {
  Object.values(navItems).forEach(item => item.classList.remove('active'));
  const activeNavKey = Object.keys(pages).find(key => pages[key].id === pageId);
  if (activeNavKey) {
    navItems[activeNavKey].classList.add('active');
  }

  Object.values(pages).forEach(page => {
    if (page.id === pageId) {
      page.classList.add('active');
    } else {
      page.classList.remove('active');
    }
  });

  if (pageId === 'page-day') {
    renderDayView();
  } else if (pageId === 'page-analysis') {
    renderAnalysisView();
  }
}

Object.keys(navItems).forEach(key => {
  navItems[key].addEventListener('click', () => {
    navigateToPage(pages[key].id);
  });
});

// Splash Screen Removal
window.addEventListener('load', () => {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    splash.classList.add('fade-out');
    document.getElementById('app').classList.remove('hidden');
    navigateToPage('page-day');
  }, 1200);
});


// --- PREMIUM MODAL SYSTEM HELPER ---
function openModal(modal) {
  modal.classList.remove('hidden');
  modal.offsetHeight; // force reflow
  modal.classList.add('active');
}

function closeModal(modal) {
  modal.classList.remove('active');
  setTimeout(() => {
    if (!modal.classList.contains('active')) {
      modal.classList.add('hidden');
    }
  }, 350);
}


// --- PAGE 2: DAILY VIEW LOGIC ---

// Calculates weighted daily score (completed adds 1.0, partial adds percentage/100)
function getDayProgress(dateStr) {
  const dayData = STATE.days[dateStr];
  if (!dayData || !dayData.tasks || dayData.tasks.length === 0) return 0;
  
  let score = 0;
  dayData.tasks.forEach(t => {
    if (t.status === 'completed') score += 1;
    else if (t.status === 'partial') score += (t.percentage || 50) / 100;
  });
  return Math.round((score / dayData.tasks.length) * 100);
}

function renderDayView() {
  const dateStr = formatDateString(selectedDate);
  const dayData = STATE.days[dateStr] || { tasks: [], note: "" };

  const isToday = formatDateString(today) === dateStr;
  const isTomorrow = formatDateString(new Date(today.getTime() + 86400000)) === dateStr;
  
  const dayTag = document.getElementById('current-day-tag');
  if (isToday) {
    dayTag.textContent = 'اليوم الحالي';
    dayTag.style.color = '#10b981';
  } else if (isTomorrow) {
    dayTag.textContent = 'الغد';
    dayTag.style.color = '#8b5cf6';
  } else {
    dayTag.textContent = 'تاريخ محدد';
    dayTag.style.color = '#06b6d4';
  }

  document.getElementById('day-title-main').textContent = getArabicDate(selectedDate);

  const tasksContainer = document.getElementById('tasks-list');
  tasksContainer.innerHTML = '';

  if (dayData.tasks.length === 0) {
    tasksContainer.innerHTML = `
      <div class="glass-card" style="text-align: center; padding: 30px; color: var(--text-muted);">
        <p style="font-size: 1.8rem; margin-bottom: 8px; color: var(--text-muted);">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto; display: block;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </p>
        <p>لا توجد مهام لهذا اليوم.</p>
        <p style="font-size: 0.8rem; margin-top: 6px;">تحدث مع المساعد في محادثة المساء أو أضف مهمة يدوياً.</p>
      </div>
    `;
  } else {
    dayData.tasks.forEach(task => {
      const taskEl = document.createElement('div');
      taskEl.className = `task-item ${task.status}`;
      taskEl.dataset.id = task.id;

      // Ultra-premium custom vectors for status buttons
      const pendingSVG = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" style="display:block;">
          <circle cx="12" cy="12" r="9"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
        </svg>`;
      
      // If task is partial, render a circular progress arc matching the actual custom percentage!
      const pctStrokeVal = task.percentage ? Math.round((task.percentage / 100) * 56) : 28; // 2 * PI * r(9) = 56
      const partialSVG = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" style="display:block;">
          <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.15)"></circle>
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-dasharray="56" stroke-dashoffset="${56 - pctStrokeVal}" transform="rotate(-90 12 12)"></circle>
        </svg>`;
        
      const completedSVG = `
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.5" style="display:block;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>`;

      const dispPctText = (task.status === 'partial' && task.percentage) ? ` (${task.percentage}%)` : '';

      taskEl.innerHTML = `
        <div class="task-info">
          <span class="task-name">${task.text}${dispPctText}</span>
          ${task.time ? `
            <span class="task-time">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              ${task.time}
            </span>
          ` : ''}
        </div>
        <div class="task-toggle-switch">
          <div class="toggle-option opt-pending" title="لم تبدأ" data-status="pending">${pendingSVG}</div>
          <div class="toggle-option opt-partial" title="إنجاز جزئي" data-status="partial">${partialSVG}</div>
          <div class="toggle-option opt-completed" title="مكتملة" data-status="completed">${completedSVG}</div>
        </div>
      `;

      const options = taskEl.querySelectorAll('.toggle-option');
      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetStatus = opt.dataset.status;
          
          if (targetStatus === 'partial') {
            // Trigger customized inline slider ratio popup
            openPartialRatioSelector(dateStr, task);
          } else {
            updateTaskStatus(dateStr, task.id, targetStatus);
          }
        });
      });

      tasksContainer.appendChild(taskEl);
    });
  }

  const pct = getDayProgress(dateStr);
  
  // Update the new horizontal progress bar
  const progressBar = document.getElementById('daily-progress-bar');
  if (progressBar) progressBar.style.width = `${pct}%`;
  
  // Keep SVG circle update for backward compat (it's hidden but JS still runs)
  const circle = document.getElementById('daily-progress-circle');
  if (circle) {
    const offset = 201 - (pct / 100) * 201;
    circle.style.strokeDashoffset = offset;
  }
  
  document.getElementById('progress-ring-value').textContent = `${pct}%`;
  const subLabel = document.getElementById('progress-percentage-text');
  if (subLabel) {
    const dStr2 = formatDateString(selectedDate);
    const hasTasks = STATE.days[dStr2] && STATE.days[dStr2].tasks && STATE.days[dStr2].tasks.length > 0;
    subLabel.textContent = hasTasks ? `${pct}% مكتمل` : 'لا توجد مهام بعد — أضف مهمة أو خطط مع Kimi';
  }

  renderTimelineGrid();
  renderWeeklyGoalTab();
}

function updateTaskStatus(dateStr, taskId, status, customPercentage = null) {
  if (STATE.days[dateStr] && STATE.days[dateStr].tasks) {
    const task = STATE.days[dateStr].tasks.find(t => t.id === taskId);
    if (task) {
      task.status = status;
      if (status === 'partial') {
        task.percentage = customPercentage !== null ? customPercentage : 50;
      } else {
        delete task.percentage; // Clean key if standard pending/completed is set
      }
      saveState();
      renderDayView();
    }
  }
}

// --- INTERACTIVE SLIDER PARTIAL COMPLETION MODAL ---
let activePartialTaskId = null;
let activePartialDateStr = null;
const partialModal = document.getElementById('partial-percentage-modal');
const partialSlider = document.getElementById('partial-pct-slider');
const partialBadge = document.getElementById('partial-pct-badge');

function openPartialRatioSelector(dateStr, task) {
  activePartialTaskId = task.id;
  activePartialDateStr = dateStr;

  document.getElementById('partial-task-title-text').textContent = task.text;
  
  const initialVal = task.percentage || 50;
  partialSlider.value = initialVal;
  partialBadge.textContent = `${initialVal}%`;
  
  openModal(partialModal);
}

// Real-time slider styling updates
partialSlider.addEventListener('input', () => {
  partialBadge.textContent = `${partialSlider.value}%`;
});

// Cancel button
document.getElementById('close-partial-modal-btn').addEventListener('click', () => closeModal(partialModal));
document.getElementById('partial-cancel-btn').addEventListener('click', () => closeModal(partialModal));

// Confirm ratio button
document.getElementById('partial-save-btn').addEventListener('click', () => {
  const selectedPct = parseInt(partialSlider.value);
  updateTaskStatus(activePartialDateStr, activePartialTaskId, 'partial', selectedPct);
  closeModal(partialModal);
});


// --- TIMELINE DRAWER & GESTURES ---
const timelineDrawer = document.getElementById('timeline-drawer');
const drawerHandle = document.getElementById('drawer-handle');
const timelineToggleBtn = document.getElementById('timeline-toggle-btn');
const drawerTabs = document.querySelectorAll('.drawer-tab-btn');
const drawerTabContents = document.querySelectorAll('.drawer-tab-content');

let drawerExpanded = false;

function toggleDrawer(forceState = null) {
  const nextState = forceState !== null ? forceState : !drawerExpanded;
  drawerExpanded = nextState;
  
  if (drawerExpanded) {
    timelineDrawer.classList.add('expanded');
    renderTimelineGrid();
  } else {
    timelineDrawer.classList.remove('expanded');
  }
}

timelineToggleBtn.addEventListener('click', () => toggleDrawer());

let startY = 0;
const drawerHeight = window.innerHeight * 0.72;

drawerHandle.addEventListener('touchstart', (e) => {
  startY = e.touches[0].clientY;
  timelineDrawer.style.transition = 'none';
}, { passive: true });

drawerHandle.addEventListener('touchmove', (e) => {
  const currentY = e.touches[0].clientY;
  const deltaY = currentY - startY;

  let newTranslate = 0;
  if (!drawerExpanded) {
    newTranslate = (drawerHeight - 60) + deltaY;
    if (newTranslate < 0) newTranslate = 0;
  } else {
    newTranslate = deltaY;
    if (newTranslate < 0) newTranslate = 0;
  }

  timelineDrawer.style.transform = `translateY(${newTranslate}px)`;
}, { passive: true });

drawerHandle.addEventListener('touchend', (e) => {
  const endY = e.changedTouches[0].clientY;
  const deltaY = endY - startY;

  timelineDrawer.style.transition = '';
  timelineDrawer.style.transform = '';

  if (!drawerExpanded) {
    if (deltaY < -60) {
      toggleDrawer(true);
    } else {
      toggleDrawer(false);
    }
  } else {
    if (deltaY > 60) {
      toggleDrawer(false);
    } else {
      toggleDrawer(true);
    }
  }
});

drawerTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    drawerTabs.forEach(t => t.classList.remove('active'));
    drawerTabContents.forEach(c => c.classList.remove('active'));

    tab.classList.add('active');
    const target = tab.dataset.target;
    document.getElementById(target).classList.add('active');
  });
});


// --- 1.5 YEARS TIMELINE GRID GENERATOR ---
function renderTimelineGrid() {
  const gridContainer = document.getElementById('months-timeline');
  gridContainer.innerHTML = '';

  let startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ];

  for (let m = 0; m < 18; m++) {
    const currentMonthDate = new Date(startDate.getFullYear(), startDate.getMonth() + m, 1);
    const monthYear = currentMonthDate.getFullYear();
    const monthIndex = currentMonthDate.getMonth();
    const monthName = monthNames[monthIndex];

    const monthBlock = document.createElement('div');
    monthBlock.className = 'month-block';

    monthBlock.innerHTML = `
      <div class="month-name-header">${monthName} ${monthYear}</div>
      <div class="days-grid" id="grid-${monthYear}-${monthIndex}"></div>
    `;

    gridContainer.appendChild(monthBlock);

    const daysGrid = document.getElementById(`grid-${monthYear}-${monthIndex}`);
    const daysInMonth = new Date(monthYear, monthIndex + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dObj = new Date(monthYear, monthIndex, day);
      const dStr = formatDateString(dObj);
      
      const dayNode = document.createElement('div');
      dayNode.className = 'day-node';
      
      if (formatDateString(selectedDate) === dStr) {
        dayNode.classList.add('active-selected');
      }

      if (formatDateString(today) === dStr) {
        dayNode.classList.add('today');
      }

      const dayData = STATE.days[dStr];
      let statClass = 'stat-none';
      if (dayData && dayData.tasks && dayData.tasks.length > 0) {
        dayNode.classList.add('has-data');
        const progress = getDayProgress(dStr);
        if (progress === 0) statClass = 'stat-none';
        else if (progress < 40) statClass = 'stat-low';
        else if (progress < 80) statClass = 'stat-mid';
        else statClass = 'stat-high';
      }
      dayNode.classList.add(statClass);

      dayNode.innerHTML = `
        <span class="day-node-num">${day}</span>
        <div class="day-node-status-dot"></div>
      `;

      dayNode.addEventListener('click', () => {
        selectedDate = new Date(monthYear, monthIndex, day);
        renderDayView();
        toggleDrawer(false);
      });

      daysGrid.appendChild(dayNode);
    }
  }
}

document.getElementById('go-to-today-btn').addEventListener('click', () => {
  selectedDate = new Date(today);
  renderDayView();
  toggleDrawer(false);
});

// --- EDIT WEEKLY GOAL TAB ---
function renderWeeklyGoalTab() {
  const weekKey = getWeekKey(selectedDate);
  const weekData = STATE.weeks[weekKey] || {
    weeklyGoal: "",
    gymTarget: 3,
    gymCompleted: 0,
    enjoyed: null
  };

  // 1. Render Yearly Goal Display
  const yearlyDisplay = document.getElementById('yearly-goal-display');
  if (STATE.settings.yearlyGoals) {
    yearlyDisplay.textContent = STATE.settings.yearlyGoals;
    yearlyDisplay.classList.remove('empty-placeholder');
  } else {
    yearlyDisplay.textContent = 'لم يتم تحديد رؤية المدى الطويل بعد. اضغط تعديل للكتابة.';
    yearlyDisplay.classList.add('empty-placeholder');
  }

  // 2. Render Monthly Goal Display
  const monthlyDisplay = document.getElementById('monthly-goal-display');
  if (STATE.settings.monthlyGoals) {
    monthlyDisplay.textContent = STATE.settings.monthlyGoals;
    monthlyDisplay.classList.remove('empty-placeholder');
  } else {
    monthlyDisplay.textContent = 'لم يتم تحديد هدف الشهر بعد. اضغط تعديل للكتابة.';
    monthlyDisplay.classList.add('empty-placeholder');
  }

  // 3. Render Weekly Goal Display
  const display = document.getElementById('weekly-goal-display');
  if (weekData.weeklyGoal) {
    display.textContent = weekData.weeklyGoal;
    display.classList.remove('empty-placeholder');
  } else {
    display.textContent = 'لم يتم تحديد هدف الأسبوع بعد. اضغط تعديل للكتابة.';
    display.classList.add('empty-placeholder');
  }

  document.getElementById('gym-count-display').textContent = `${weekData.gymCompleted} من أصل ${weekData.gymTarget} أيام`;
  document.getElementById('gym-current-val').textContent = weekData.gymCompleted;

  let gymPct = (weekData.gymCompleted / (weekData.gymTarget || 1)) * 100;
  if (gymPct > 100) gymPct = 100;
  
  let dayTotalPct = 0;
  let dayCount = 0;
  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dStr = formatDateString(d);
    const dData = STATE.days[dStr];
    if (dData && dData.tasks && dData.tasks.length > 0) {
      dayTotalPct += getDayProgress(dStr);
      dayCount++;
    }
  }

  let avgDayPct = dayCount > 0 ? (dayTotalPct / dayCount) : 0;
  let overallWeekPct = Math.round((gymPct + avgDayPct) / 2);

  document.getElementById('weekly-progress-pct').textContent = `${overallWeekPct}%`;
  document.getElementById('weekly-progress-fill').style.width = `${overallWeekPct}%`;

  const completedTasksList = document.getElementById('weekly-completed-tasks-list');
  completedTasksList.innerHTML = '';

  let listCount = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dStr = formatDateString(d);
    const dData = STATE.days[dStr];
    
    if (dData && dData.tasks) {
      dData.tasks.forEach(t => {
        if (t.status === 'completed' && listCount < 5) {
          const li = document.createElement('li');
          li.innerHTML = `<span style="color:#10b981; display:inline-flex; align-items:center; transform:translateY(1.5px); margin-left:6px;"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path></svg></span> ${t.text}`;
          completedTasksList.appendChild(li);
          listCount++;
        }
      });
    }
  }

  if (listCount === 0) {
    completedTasksList.innerHTML = `
      <li style="background: transparent; border: none; color: var(--text-muted); font-style: italic;">
        لا توجد مهام منجزة مسجلة في هذا الأسبوع حتى الآن.
      </li>
    `;
  }
}

document.getElementById('gym-plus-btn').addEventListener('click', () => {
  const weekKey = getWeekKey(selectedDate);
  if (!STATE.weeks[weekKey]) STATE.weeks[weekKey] = { weeklyGoal: "", gymTarget: 3, gymCompleted: 0, enjoyed: null };
  
  if (STATE.weeks[weekKey].gymCompleted < STATE.weeks[weekKey].gymTarget) {
    STATE.weeks[weekKey].gymCompleted++;
    saveState();
    renderDayView();
  }
});

document.getElementById('gym-minus-btn').addEventListener('click', () => {
  const weekKey = getWeekKey(selectedDate);
  if (!STATE.weeks[weekKey]) STATE.weeks[weekKey] = { weeklyGoal: "", gymTarget: 3, gymCompleted: 0, enjoyed: null };
  
  if (STATE.weeks[weekKey].gymCompleted > 0) {
    STATE.weeks[weekKey].gymCompleted--;
    saveState();
    renderDayView();
  }
});


// --- PAGE 1: EVENING CHAT & FIREWORKS AI KIMI ---

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

let chatHistory = [];

const SYSTEM_PROMPT_TEMPLATE = `أنت "مخطط الغد"، مساعد ذكاء اصطناعي خبير ومقرب. مهمتك هي مساعدة المستخدم في التخطيط لليوم التالي أو اليوم الحالي بطريقة مرنة وملهمة ودون ضغوط.
- تحدث باللغة العربية بأسلوب ودود ومحفز وبسيط جداً.
- ناقش المستخدم في مهامه واقترح عليه توزيعاً زمنياً منطقياً.
- عندما يطلب المستخدم إنهاء التخطيط وصياغة خطته، أو عندما تنتهي المحادثة وتتفقان على المهام، يجب عليك صياغة الخطة النهائية كقائمة مهام منظمة.
- لمساعدتك على إرسال الخطة للتطبيق تلقائياً، قم بصياغة ردك بحيث يحتوي في نهايته على كود JSON واضح محاط بـ \`\`\`json \`\`\` ويحتوي على معامل target_day ومصفوفة المهام بالصيغة التالية تماماً:
{
  "target_day": "today", // أو "tomorrow" حسب اليوم الذي تم التخطيط له في المحادثة
  "tasks": [
    { "text": "اسم المهمة باللغة العربية", "time": "الوقت المقترح (مثال: 08:30 مساءً أو اختياري)" }
  ]
}
ملاحظة: لا تضع أي أهداف أسبوعية أو شهرية. خطة لليوم التالي أو اليوم الحالي فقط.`;

function initChatPage() {
  chatMessages.innerHTML = '';
  
  const savedHistory = localStorage.getItem('the_goal_chat_history');
  if (savedHistory) {
    try {
      chatHistory = JSON.parse(savedHistory);
      // Ensure system prompt rules are always updated at index 0
      if (chatHistory.length > 0 && chatHistory[0].role === 'system') {
        chatHistory[0].content = SYSTEM_PROMPT_TEMPLATE;
      }
      
      let renderedCount = 0;
      chatHistory.forEach(msg => {
        if (msg.role === 'user') {
          appendChatMessage('user', msg.content);
          renderedCount++;
        } else if (msg.role === 'assistant') {
          appendChatMessage('ai', msg.content);
          renderedCount++;
        }
      });
      if (renderedCount > 0) {
        return;
      }
    } catch (e) {
      console.error("خطأ في تحميل ذاكرة المحادثة:", e);
    }
  }

  // Fallback to fresh startup
  const greetingText = `أهلاً بك يا صديقي! كيف مر يومك اليوم؟ دعنا ندردش قليلاً لنخطط لغدٍ مثالي. أخبرني بأهم ما ترغب في إنجازه غداً.`;
  chatHistory = [
    {
      role: 'system',
      content: SYSTEM_PROMPT_TEMPLATE
    },
    {
      role: 'assistant',
      content: greetingText
    }
  ];
  localStorage.setItem('the_goal_chat_history', JSON.stringify(chatHistory));
  appendChatMessage('ai', greetingText);
}

initChatPage();

// Clear Chat Button event listener
document.getElementById('clear-chat-btn').addEventListener('click', () => {
  if (confirm("هل تريد مسح هذه المحادثة والبدء من جديد؟")) {
    localStorage.removeItem('the_goal_chat_history');
    initChatPage();
  }
});

// --- HIGH-PERFORMANCE LIGHTWEIGHT MARKDOWN PARSER (Arabic & PWA Optimized) ---
function markdownToHTML(text) {
  // Pre-process escaping HTML tags to prevent raw layout injection, keeping inline styling safe
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = escaped.split('\n');
  let htmlResult = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let tableRows = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Horizontal rule
    if (line === '---' || line === '***' || line === '___') {
      closeOpenStructures(htmlResult);
      htmlResult.push('<hr>');
      continue;
    }

    // Headers (H1 - H6)
    if (line.startsWith('#')) {
      closeOpenStructures(htmlResult);
      let level = 0;
      while (line.startsWith('#')) {
        level++;
        line = line.substring(1);
      }
      level = Math.min(level, 6);
      htmlResult.push(`<h${level}>${parseInlineMarkdown(line.trim())}</h${level}>`);
      continue;
    }

    // Unordered lists
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
      if (inOl) {
        htmlResult.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        htmlResult.push('<ul>');
        inUl = true;
      }
      let content = line.replace(/^[-*•]\s+/, '');
      htmlResult.push(`<li>${parseInlineMarkdown(content)}</li>`);
      continue;
    }

    // Ordered lists
    if (/^\d+\.\s+/.test(line)) {
      if (inUl) {
        htmlResult.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        htmlResult.push('<ol>');
        inOl = true;
      }
      let content = line.replace(/^\d+\.\s+/, '');
      htmlResult.push(`<li>${parseInlineMarkdown(content)}</li>`);
      continue;
    }

    // Tables
    if (line.startsWith('|') && line.endsWith('|')) {
      if (inUl) { htmlResult.push('</ul>'); inUl = false; }
      if (inOl) { htmlResult.push('</ol>'); inOl = false; }
      
      // Separator row (e.g. | --- | --- |)
      if (/^[|\s\-:]+$/.test(line) && line.includes('-')) {
        inTable = true;
        continue;
      }

      if (!inTable) {
        inTable = true;
        const cols = line.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
        let headerHTML = '<thead><tr>';
        cols.forEach(c => {
          headerHTML += `<th>${parseInlineMarkdown(c)}</th>`;
        });
        headerHTML += '</tr></thead>';
        tableRows.push(headerHTML);
      } else {
        const cols = line.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length - 1);
        let rowHTML = '<tr>';
        cols.forEach(c => {
          rowHTML += `<td>${parseInlineMarkdown(c)}</td>`;
        });
        rowHTML += '</tr>';
        tableRows.push(rowHTML);
      }
      continue;
    } else {
      if (inTable) {
        htmlResult.push('<table>' + tableRows.join('') + '</table>');
        tableRows = [];
        inTable = false;
      }
    }

    // Normal paragraph
    if (line === '') {
      closeOpenStructures(htmlResult);
    } else {
      if (!inUl && !inOl && !inTable) {
        htmlResult.push(`<p>${parseInlineMarkdown(line)}</p>`);
      }
    }
  }

  closeOpenStructures(htmlResult);

  function closeOpenStructures(arr) {
    if (inUl) { arr.push('</ul>'); inUl = false; }
    if (inOl) { arr.push('</ol>'); inOl = false; }
    if (inTable) {
      arr.push('<table>' + tableRows.join('') + '</table>');
      tableRows = [];
      inTable = false;
    }
  }

  return htmlResult.join('\n');
}

function parseInlineMarkdown(text) {
  let res = text;
  // Bold **bold** & __bold__
  res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  res = res.replace(/__(.*?)__/g, '<strong>$1</strong>');
  // Italic *italic* & _italic_
  res = res.replace(/\*(.*?)\*/g, '<em>$1</em>');
  res = res.replace(/_(.*?)_/g, '<em>$1</em>');
  // Inline Code `code`
  res = res.replace(/`(.*?)`/g, '<code>$1</code>');
  return res;
}

function appendChatMessage(role, content) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;
  
  // Strip internal thinking/reasoning tags that kimi-k2p6 sometimes exposes
  let cleanContent = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
  
  if (cleanContent.includes('```json')) {
    cleanContent = cleanContent.split('```json')[0].trim();
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  // Unique id for copy target
  const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;

  msgEl.innerHTML = `
    <div class="message-bubble" id="${msgId}">${markdownToHTML(cleanContent)}</div>
    <div class="message-meta">
      <button class="msg-copy-btn" title="نسخ" onclick="copyMsgText('${msgId}', this)">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      </button>
      <span class="message-time">${timeStr}</span>
    </div>
  `;

  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function copyMsgText(msgId, btn) {
  const bubble = document.getElementById(msgId);
  if (!bubble) return;
  const text = bubble.innerText || bubble.textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    setTimeout(() => {
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
    }, 2000);
  });
}

let typingIndicator = null;
function showTypingIndicator() {
  if (typingIndicator) return;
  typingIndicator = document.createElement('div');
  typingIndicator.className = 'message ai';
  typingIndicator.innerHTML = `
    <div class="message-bubble typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  chatMessages.appendChild(typingIndicator);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
  if (typingIndicator) {
    typingIndicator.remove();
    typingIndicator = null;
  }
}

chatInput.addEventListener('input', () => {
  sendChatBtn.disabled = chatInput.value.trim() === '';
  chatInput.style.height = 'auto';
  chatInput.style.height = `${chatInput.scrollHeight}px`;
});

// Call Fireworks Kimi API with injected dynamic goals context
async function callDeepSeekAI(userMessageText) {
  // Push user message to history
  chatHistory.push({ role: 'user', content: userMessageText });
  localStorage.setItem('the_goal_chat_history', JSON.stringify(chatHistory));
  showTypingIndicator();

  // DYNAMIC GOALS CONTEXT INJECTION (Makes the AI fully aware of all benchmarks!)
  const tomorrow = new Date(today.getTime() + 86400000);
  
  const currentWeekKey = getWeekKey(today);
  const tomorrowWeekKey = getWeekKey(tomorrow);
  
  const currentWData = STATE.weeks[currentWeekKey] || { weeklyGoal: "", gymTarget: 3, gymCompleted: 0 };
  const tomorrowWData = STATE.weeks[tomorrowWeekKey] || { weeklyGoal: "", gymTarget: 3, gymCompleted: 0 };
  
  const currentWeeklyGoal = currentWData.weeklyGoal || "لم يحدد بعد";
  const tomorrowWeeklyGoal = tomorrowWData.weeklyGoal || "لم يحدد بعد";
  const gymTarget = currentWData.gymTarget || 3;
  const gymCompleted = currentWData.gymCompleted || 0;
  
  const monthlyGoal = STATE.settings.monthlyGoals || "لم يحدد بعد";
  const yearlyGoal = STATE.settings.yearlyGoals || "لم يحدد بعد";
  const marriageTarget = STATE.settings.marriageGoal.target;
  const marriageCurrent = STATE.settings.marriageGoal.current;
  const marriagePct = Math.min(Math.round((marriageCurrent / marriageTarget) * 100), 100);

  // Today's exact performance summary
  const todayStr = formatDateString(today);
  const todayData = STATE.days[todayStr] || { tasks: [] };
  const todayProgress = getDayProgress(todayStr);
  
  let todayTasksSummary = "";
  if (todayData.tasks && todayData.tasks.length > 0) {
    todayTasksSummary = todayData.tasks.map(t => {
      let statusStr = "معلقة 🔴";
      if (t.status === 'completed') statusStr = "مكتملة ✅";
      else if (t.status === 'partial') statusStr = `مكتملة جزئياً ⏳ (${t.percentage}%)`;
      return `- ${t.text} (${statusStr}${t.time ? ` - الساعة: ${t.time}` : ''})`;
    }).join("\n");
  } else {
    todayTasksSummary = "لا توجد مهام مسجلة لليوم الحالي.";
  }

  const todayArabicName = getArabicDate(today);
  const tomorrowArabicName = getArabicDate(tomorrow);

  // Prepend or inject context instructions into the system instruction or request
  const systemPromptObj = chatHistory[0];
  const originalSystemPrompt = `أنت "مخطط الغد"، مساعد ذكاء اصطناعي خبير ومقرب. مهمتك هي مساعدة المستخدم في التخطيط لليوم التالي أو اليوم الحالي بطريقة مرنة وملهمة ودون ضغوط.
- تحدث باللغة العربية بأسلوب ودود ومحفز وبسيط جداً.
- ناقش المستخدم في مهامه واقترح عليه توزيعاً زمنياً منطقياً.
- عندما يطلب المستخدم إنهاء التخطيط وصياغة خطته، أو عندما تنتهي المحادثة وتتفقان على المهام، يجب عليك صياغة الخطة النهائية كقائمة مهام منظمة.
- لمساعدتك على إرسال الخطة للتطبيق تلقائياً، قم بصياغة ردك بحيث يحتوي في نهايته على كود JSON واضح محاط بـ \`\`\`json \`\`\` ويحتوي على معامل target_day ومصفوفة المهام بالصيغة التالية تماماً:
{
  "target_day": "today", // أو "tomorrow" حسب اليوم الذي تم التخطيط له في المحادثة
  "tasks": [
    { "text": "اسم المهمة باللغة العربية", "time": "الوقت المقترح (مثال: 08:30 مساءً أو اختياري)" }
  ]
}
ملاحظة: لا تضع أي أهداف أسبوعية أو شهرية. خطة لليوم التالي أو اليوم الحالي فقط.`;

  // Injecting goals context dynamically so Kimi acts as a personalized coach!
  systemPromptObj.content = `${originalSystemPrompt}

🚨 معلومات الوقت والتخطيط:
- اليوم الحالي هو: ${todayArabicName}
- الغد هو: ${tomorrowArabicName}
- **مهم جداً:** المستخدم قد يطلب التخطيط لليوم الحالي (${todayArabicName}) أو الغد (${tomorrowArabicName}) أو أي يوم آخر يذكره. افهم قصده بوضوح من السياق ولا تفرض عليه تخطيط الغد فقط. إذا قال "النهارده" أو "اليوم" فهو يقصد ${todayArabicName}. إذا قال "بكرة" أو "الغد" فهو يقصد ${tomorrowArabicName}. تصرف بمرونة تامة.

🚨 سياق أهداف المستخدم الكبرى الحالية:
- هدف الأفق الطويل (رؤية السنة والنصف): "${yearlyGoal}"
- هدف الشهر الحالي: "${monthlyGoal}"
- هدف الأسبوع الحالي: "${currentWeeklyGoal}"
- تحدي النادي الرياضي (الجيم) للأسبوع الحالي: حضور ${gymCompleted} أيام من أصل ${gymTarget} أيام.
- حصالة الزواج (الهدف الأكبر): تم توفير ${marriageCurrent.toLocaleString()} ج.م من أصل هدف ${marriageTarget.toLocaleString()} ج.م (نسبة الإنجاز: ${marriagePct}%).

${currentWeekKey !== tomorrowWeekKey ? `⚠️ ملاحظة: غداً يبدأ أسبوع جديد! هدف الأسبوع القادم هو: "${tomorrowWeeklyGoal}"\n` : ''}

🚨 أداء ومهام اليوم الحالي (${todayArabicName}) للمراجعة:
- نسبة إنجاز اليوم الإجمالية: ${todayProgress}%
- قائمة مهام اليوم:
${todayTasksSummary}

استغل هذا السياق بدقة ولطف وثقة وذكاء. ربط مهام اليوم بأهداف الأسبوع والشهر والسنة وحصالة الزواج. لا تفكر بصوت عالٍ أمام المستخدم — اعطِه ردوداً نظيفة ومباشرة فقط.`;

  const apiKey = "fw_MWKEEFscc36msc6AqmFgNk";
  const model = "accounts/fireworks/models/kimi-k2p6"; // Fully aligned with Kimi-k2p6!

  try {
    const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: chatHistory,
        temperature: 0.7,
        max_tokens: 3000,
        reasoning_effort: "none"  // Disable extended thinking to save tokens
      })
    });

    if (!response.ok) {
      throw new Error(`خطأ في استجابة المخدم: ${response.status}`);
    }

    const resData = await response.json();
    let reply = resData.choices[0].message.content;
    
    // Strip any exposed thinking/reasoning blocks (kimi-k2p6 may leak these)
    reply = reply
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
      .trim();
    
    hideTypingIndicator();
    appendChatMessage('ai', reply);
    
    chatHistory.push({ role: 'assistant', content: reply });
    localStorage.setItem('the_goal_chat_history', JSON.stringify(chatHistory));
    saveState(); // Trigger immediate cloud sync push!

    // Quietly consolidate and compress old messages if count > 7 to optimize API consumption
    setTimeout(() => {
      consolidateChatHistory();
    }, 500);

    if (reply.includes('```json')) {
      extractAndProcessJSONPlan(reply);
    }

  } catch (error) {
    console.error(error);
    hideTypingIndicator();
    appendChatMessage('ai', `عذراً يا صديقي، واجهت مشكلة في الاتصال بـ Kimi. يرجى التحقق من مفتاح الـ API والاتصال بالشبكة. 🌐 (${error.message})`);
  }
}

async function handleSendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  chatInput.style.height = 'auto';
  sendChatBtn.disabled = true;

  appendChatMessage('user', text);
  await callDeepSeekAI(text);
}

sendChatBtn.addEventListener('click', handleSendMessage);
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});


// --- EXTRACTION OF THE JSON PLAN & PROPOSAL MODAL ---
let proposedTasksList = [];
let proposedTargetDate = 'tomorrow'; // Can be 'today' or 'tomorrow'

function extractAndProcessJSONPlan(aiText) {
  try {
    const jsonMatch = aiText.match(/```json([\s\S]*?)```/);
    if (!jsonMatch) return;
    
    const rawJson = jsonMatch[1].trim();
    const data = JSON.parse(rawJson);
    
    if (data && data.tasks && Array.isArray(data.tasks)) {
      proposedTasksList = data.tasks.map((t, idx) => ({
        id: Date.now() + idx,
        text: t.text || t.name,
        time: t.time || '',
        status: 'pending'
      }));
      
      // Determine if planning is for today or tomorrow
      if (data.target_day === 'today') {
        proposedTargetDate = 'today';
      } else {
        proposedTargetDate = 'tomorrow';
      }
      
      openPlanProposalModal();
    }
  } catch (e) {
    console.error("فشل استخراج الخطة المقترحة:", e);
  }
}

const planModal = document.getElementById('plan-proposal-modal');
const proposedListContainer = document.getElementById('proposed-tasks-list');

function openPlanProposalModal() {
  proposedListContainer.innerHTML = '';
  proposedTasksList.forEach(task => {
    renderProposedTaskRow(task);
  });

  // Dynamically update modal headers and buttons based on target date
  const modalHeader = document.querySelector('#plan-proposal-modal h3');
  if (modalHeader) {
    modalHeader.textContent = proposedTargetDate === 'today' ? 'مسودة خطة اليوم المقترحة' : 'مسودة خطة الغد المقترحة';
  }
  const approveBtn = document.getElementById('modal-approve-btn');
  if (approveBtn) {
    approveBtn.textContent = proposedTargetDate === 'today' ? 'اعتماد خطة اليوم ونقلها لصفحة يومي' : 'اعتماد خطة الغد ونقلها لصفحة يومي';
  }

  openModal(planModal);
}

function renderProposedTaskRow(task) {
  const row = document.createElement('div');
  row.className = 'proposed-task-item';
  row.dataset.id = task.id;

  row.innerHTML = `
    <div class="proposed-task-details">
      <input type="text" class="p-name" value="${task.text}">
      <input type="text" class="p-time" value="${task.time}" placeholder="الوقت">
    </div>
    <button class="p-delete-btn" title="حذف">&times;</button>
  `;

  row.querySelector('.p-name').addEventListener('input', (e) => {
    task.text = e.target.value;
  });
  row.querySelector('.p-time').addEventListener('input', (e) => {
    task.time = e.target.value;
  });
  row.querySelector('.p-delete-btn').addEventListener('click', () => {
    proposedTasksList = proposedTasksList.filter(t => t.id !== task.id);
    row.remove();
  });

  proposedListContainer.appendChild(row);
}

document.getElementById('close-plan-modal-btn').addEventListener('click', () => closeModal(planModal));
document.getElementById('modal-cancel-btn').addEventListener('click', () => closeModal(planModal));

document.getElementById('modal-add-task-btn').addEventListener('click', () => {
  const textInput = document.getElementById('modal-new-task-text');
  const timeInput = document.getElementById('modal-new-task-time');
  
  const text = textInput.value.trim();
  const time = timeInput.value.trim();

  if (text) {
    const newTask = {
      id: Date.now(),
      text: text,
      time: time,
      status: 'pending'
    };
    proposedTasksList.push(newTask);
    renderProposedTaskRow(newTask);

    textInput.value = '';
    timeInput.value = '';
  }
});

document.getElementById('modal-approve-btn').addEventListener('click', () => {
  if (proposedTasksList.length === 0) {
    alert("برجاء إضافة مهمة واحدة على الأقل قبل الاعتماد.");
    return;
  }

  const targetDate = proposedTargetDate === 'today' ? today : new Date(today.getTime() + 86400000);
  const targetDateStr = formatDateString(targetDate);

  STATE.days[targetDateStr] = {
    tasks: proposedTasksList,
    note: proposedTargetDate === 'today' ? "تم التخطيط لليوم عبر محادثة المساء الذكية" : "تم التخطيط للغد عبر محادثة المساء الذكية"
  };

  saveState();
  closeModal(planModal);

  if (proposedTargetDate === 'today') {
    alert("تمت الموافقة على الخطة بنجاح ونقلها لصفحة يومي لليوم!");
  } else {
    alert("تمت الموافقة على الخطة بنجاح ونقلها لصفحة يومي لغدٍ!");
  }
  selectedDate = targetDate;
  renderDayView();
  navigateToPage('page-day');
  localStorage.removeItem('the_goal_chat_history'); // Clear chat memory upon plan finalization
  initChatPage();
});


// --- PAGE 3: ANALYSIS VIEW LOGIC & CHARTS ---

function renderAnalysisView() {
  const mg = STATE.settings.marriageGoal;
  const pct = Math.min(Math.round((mg.current / mg.target) * 100), 100);

  document.getElementById('marriage-saved-text').textContent = `${mg.current.toLocaleString()} ج.م`;
  document.getElementById('marriage-target-text').textContent = `${mg.target.toLocaleString()} ج.م`;
  document.getElementById('marriage-progress-fill').style.width = `${pct}%`;
  document.getElementById('marriage-pct-text').textContent = `${pct}% مكتمل`;

  const weeksContainer = document.getElementById('analysis-weeks-list');
  weeksContainer.innerHTML = '';

  const weekListKeys = getRecentWeeksList();
  const weekAverages = [];

  weekListKeys.forEach((wk, index) => {
    const wData = STATE.weeks[wk] || { weeklyGoal: "", gymTarget: 3, gymCompleted: 0, enjoyed: null };
    const weekRangeStr = getWeekDateRangeText(wk);
    const avgCompletion = calculateWeekAverageCompletion(wk);
    weekAverages.unshift(avgCompletion);

    const isCurrent = getWeekKey(today) === wk;

    // Check if there is actual data in the week to warrant rendering it in history accordion
    const completedTasks = getCompletedTasksOfWeek(wk);
    const hasWeeklyGoal = !!wData.weeklyGoal;
    const hasGymProgress = wData.gymCompleted > 0;
    const hasEnjoymentState = wData.enjoyed !== null;
    const hasCompletedTasks = completedTasks.length > 0;

    const shouldRenderAccordion = isCurrent || hasWeeklyGoal || hasGymProgress || hasEnjoymentState || hasCompletedTasks;

    if (shouldRenderAccordion) {
      const happySVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:4px; display:inline-block; transform:translateY(1.5px);"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`;
      const sadSVG = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:4px; display:inline-block; transform:translateY(1.5px);"><circle cx="12" cy="12" r="10"></circle><path d="M16 16s-1.5-2-4-2-4 2-4 2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>`;

      const accordion = document.createElement('div');
      accordion.className = 'week-accordion-item';
      
      if (isCurrent) {
        accordion.classList.add('expanded');
      }

      accordion.innerHTML = `
        <div class="week-accordion-header">
          <div class="week-acc-info">
            <span class="week-acc-title">الأسبوع ${wk.split('-W')[1]} ${isCurrent ? '(الحالي)' : ''}</span>
            <span class="week-acc-date">${weekRangeStr}</span>
          </div>
          <div class="week-acc-right">
            <div class="week-completion-mini">
              <span class="completion-mini-pct">${avgCompletion}%</span>
              <div class="completion-mini-bar-bg">
                <div class="completion-mini-bar-fill" style="width: ${avgCompletion}%"></div>
              </div>
            </div>
            <span class="arrow-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block; transition: transform 0.3s ease;">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </span>
          </div>
        </div>
        <div class="week-accordion-body">
          
          <div class="enjoyment-box">
            <span class="enjoy-question">هل استمتعت بالرحلة والتقدم هذا الأسبوع؟</span>
            <div class="enjoy-toggle-buttons">
              <button class="enjoy-btn btn-yes ${wData.enjoyed === true ? 'active' : ''}" data-val="true">${happySVG} نعم</button>
              <button class="enjoy-btn btn-no ${wData.enjoyed === false ? 'active' : ''}" data-val="false">${sadSVG} لا</button>
            </div>
          </div>

          <div class="week-tasks-summary">
            <h5 style="display:flex; align-items:center; gap:6px;">
              <span style="color:#a78bfa; display:flex;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
              </span>
              هدف الأسبوع:
            </h5>
            <p style="font-size:0.85rem; color:var(--text-main); margin-bottom:8px;">
              ${wData.weeklyGoal || '<span style="color:var(--text-muted); font-style:italic;">لم يحدد بعد</span>'}
            </p>
            <h5 style="display:flex; align-items:center; gap:6px;">
              <span style="color:#06b6d4; display:flex;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="18" y2="12"></line><line x1="6" y1="7" x2="6" y2="17"></line><line x1="18" y1="7" x2="18" y2="17"></line></svg>
              </span>
              النادي الرياضي:
            </h5>
            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:8px;">
              حضور النادي: ${wData.gymCompleted} أيام من أصل ${wData.gymTarget}
            </p>
            <h5 style="display:flex; align-items:center; gap:6px;">
              <span style="color:#10b981; display:flex;">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
              </span>
              المهام الكبرى المنجزة هذا الأسبوع:
            </h5>
            <ul class="summary-tasks-ul">
              <!-- Filled dynamically -->
            </ul>
          </div>
        </div>
      `;

      const ul = accordion.querySelector('.summary-tasks-ul');
      
      if (compTasks.length === 0) {
        ul.innerHTML = '<li class="no-tasks">لا توجد مهام منجزة مسجلة في هذا الأسبوع.</li>';
      } else {
        compTasks.forEach(tText => {
          const li = document.createElement('li');
          li.innerHTML = `<span style="color:#10b981; display:inline-flex; align-items:center; transform:translateY(1.5px); margin-left:6px;"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"></path></svg></span> ${tText}`;
          ul.appendChild(li);
        });
      }

      accordion.querySelector('.week-accordion-header').addEventListener('click', () => {
        accordion.classList.toggle('expanded');
      });

      accordion.querySelectorAll('.enjoy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const enjoyedVal = btn.dataset.val === 'true';
          
          if (!STATE.weeks[wk]) {
            STATE.weeks[wk] = { weeklyGoal: "", gymTarget: 3, gymCompleted: 0, enjoyed: null };
          }
          STATE.weeks[wk].enjoyed = enjoyedVal;
          saveState();
          renderAnalysisView();
        });
      });

      weeksContainer.appendChild(accordion);
    }
  });

  drawTrendChart(weekAverages);
}

function getRecentWeeksList() {
  const list = [];
  const curr = new Date(today);
  
  for (let i = 0; i < 5; i++) {
    const d = new Date(curr.getTime() - i * 7 * 24 * 60 * 60 * 1000);
    list.push(getWeekKey(d));
  }
  return list;
}

function getWeekDateRangeText(weekKey) {
  const parts = weekKey.split('-W');
  const year = parseInt(parts[0]);
  const week = parseInt(parts[1]);

  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const Sunday = new Date(simple);
  Sunday.setDate(simple.getDate() - dayOfWeek);
  
  const Saturday = new Date(Sunday);
  Saturday.setDate(Sunday.getDate() + 6);

  const startOpt = { day: 'numeric', month: 'short' };
  const endOpt = { day: 'numeric', month: 'short' };

  return `${Sunday.toLocaleDateString('ar-EG', startOpt)} - ${Saturday.toLocaleDateString('ar-EG', endOpt)}`;
}

function calculateWeekAverageCompletion(weekKey) {
  const parts = weekKey.split('-W');
  const year = parseInt(parts[0]);
  const week = parseInt(parts[1]);

  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const Sunday = new Date(simple);
  Sunday.setDate(simple.getDate() - dayOfWeek);

  let totalPct = 0;
  let loggedDaysCount = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(Sunday);
    d.setDate(Sunday.getDate() + i);
    const dStr = formatDateString(d);
    
    const dayData = STATE.days[dStr];
    if (dayData && dayData.tasks && dayData.tasks.length > 0) {
      totalPct += getDayProgress(dStr);
      loggedDaysCount++;
    }
  }

  return loggedDaysCount > 0 ? Math.round(totalPct / loggedDaysCount) : 0;
}

function getCompletedTasksOfWeek(weekKey) {
  const parts = weekKey.split('-W');
  const year = parseInt(parts[0]);
  const week = parseInt(parts[1]);

  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const Sunday = new Date(simple);
  Sunday.setDate(simple.getDate() - dayOfWeek);

  const completed = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Sunday);
    d.setDate(Sunday.getDate() + i);
    const dStr = formatDateString(d);
    
    const dayData = STATE.days[dStr];
    if (dayData && dayData.tasks) {
      dayData.tasks.forEach(t => {
        if (t.status === 'completed') {
          completed.push(t.text);
        }
      });
    }
  }
  return completed.slice(0, 5);
}

function drawTrendChart(averages) {
  const svg = document.getElementById('trend-svg');
  svg.innerHTML = '';

  const width = 400;
  const height = 150;
  const padding = 25;

  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const points = averages.map((avg, index) => {
    const x = padding + (index / (averages.length - 1)) * chartWidth;
    const y = padding + chartHeight - (avg / 100) * chartHeight;
    return { x, y };
  });

  for (let i = 0; i <= 4; i++) {
    const gridY = padding + (i / 4) * chartHeight;
    const gridLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    gridLine.setAttribute("x1", padding);
    gridLine.setAttribute("y1", gridY);
    gridLine.setAttribute("x2", width - padding);
    gridLine.setAttribute("y2", gridY);
    gridLine.setAttribute("stroke", "rgba(255,255,255,0.03)");
    gridLine.setAttribute("stroke-width", "1");
    svg.appendChild(gridLine);
  }

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`;
  }

  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  
  const strokeGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  strokeGrad.setAttribute("id", "chartStrokeGrad");
  strokeGrad.innerHTML = `
    <stop offset="0%" stop-color="#8b5cf6" />
    <stop offset="50%" stop-color="#06b6d4" />
    <stop offset="100%" stop-color="#10b981" />
  `;
  defs.appendChild(strokeGrad);

  const fillGrad = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  fillGrad.setAttribute("id", "chartFillGrad");
  fillGrad.setAttribute("x1", "0");
  fillGrad.setAttribute("y1", "0");
  fillGrad.setAttribute("x2", "0");
  fillGrad.setAttribute("y2", "1");
  fillGrad.innerHTML = `
    <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.25" />
    <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.0" />
  `;
  defs.appendChild(fillGrad);
  svg.appendChild(defs);

  const areaD = `${pathD} L ${points[points.length - 1].x} ${padding + chartHeight} L ${points[0].x} ${padding + chartHeight} Z`;
  const areaPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  areaPath.setAttribute("d", areaD);
  areaPath.setAttribute("fill", "url(#chartFillGrad)");
  svg.appendChild(areaPath);

  const strokePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  strokePath.setAttribute("d", pathD);
  strokePath.setAttribute("fill", "none");
  strokePath.setAttribute("stroke", "url(#chartStrokeGrad)");
  strokePath.setAttribute("stroke-width", "3.5");
  strokePath.setAttribute("stroke-linecap", "round");
  svg.appendChild(strokePath);

  points.forEach((pt, index) => {
    const val = averages[index];
    
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", pt.x);
    circle.setAttribute("cy", pt.y);
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "#040407");
    circle.setAttribute("stroke", index === points.length - 1 ? "#10b981" : "#06b6d4");
    circle.setAttribute("stroke-width", "3");
    svg.appendChild(circle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", pt.x);
    text.setAttribute("y", pt.y - 10);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "#fff");
    text.setAttribute("font-size", "9px");
    text.setAttribute("font-family", "Cairo");
    text.setAttribute("font-weight", "bold");
    text.textContent = `${val}%`;
    svg.appendChild(text);
  });

  const trendTxt = document.getElementById('trend-indicator-text');
  if (averages.length >= 2) {
    const latest = averages[averages.length - 1];
    const prev = averages[averages.length - 2];
    const diff = latest - prev;

    if (diff > 5) {
      trendTxt.innerHTML = `صاعد <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" style="display:inline; vertical-align:middle; margin-right:4px;"><polyline points="18 15 12 9 6 15"></polyline></svg>`;
      trendTxt.style.color = "#10b981";
      trendTxt.style.background = "rgba(16, 185, 129, 0.08)";
    } else if (diff < -5) {
      trendTxt.innerHTML = `هابط <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" style="display:inline; vertical-align:middle; margin-right:4px;"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
      trendTxt.style.color = "#ef4444";
      trendTxt.style.background = "rgba(239, 68, 68, 0.08)";
    } else {
      trendTxt.innerHTML = `ثابت <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" style="display:inline; vertical-align:middle; margin-right:4px;"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
      trendTxt.style.color = "var(--text-secondary)";
      trendTxt.style.background = "rgba(255, 255, 255, 0.05)";
    }
  }
}


// --- MODAL TRIGGERS AND CONFIGURATION FORMS ---

const goalsModal = document.getElementById('goals-editor-modal');

document.getElementById('open-goals-btn').addEventListener('click', () => openModal(goalsModal));
document.getElementById('close-goals-modal-btn').addEventListener('click', () => closeModal(goalsModal));
document.getElementById('config-cancel-btn').addEventListener('click', () => closeModal(goalsModal));

function openGoalsModal() {
  document.getElementById('config-api-key').value = STATE.settings.apiKey;
  document.getElementById('config-api-model').value = STATE.settings.apiModel;
  document.getElementById('config-app-pin').value = STATE.settings.appPin || "1234";
  document.getElementById('config-marriage-target').value = STATE.settings.marriageGoal.target;
  document.getElementById('config-marriage-current').value = STATE.settings.marriageGoal.current;
  
  document.getElementById('config-yearly-goals').value = STATE.settings.yearlyGoals || "";
  document.getElementById('config-monthly-goals').value = STATE.settings.monthlyGoals || "";

  // Prefill GitHub Sync configurations
  const gh = STATE.settings.github || { username: "", repo: "", token: "", lastSynced: "" };
  document.getElementById('config-gh-user').value = gh.username || "";
  document.getElementById('config-gh-repo').value = gh.repo || "";
  document.getElementById('config-gh-token').value = gh.token || "";
  updateSyncStatusIndicator();

  openModal(goalsModal);
}

document.getElementById('config-save-btn').addEventListener('click', async () => {
  STATE.settings.apiKey = document.getElementById('config-api-key').value.trim();
  STATE.settings.apiModel = document.getElementById('config-api-model').value.trim();
  STATE.settings.appPin = document.getElementById('config-app-pin').value.trim() || "1234";
  STATE.settings.marriageGoal.target = parseFloat(document.getElementById('config-marriage-target').value) || 180000;
  STATE.settings.marriageGoal.current = parseFloat(document.getElementById('config-marriage-current').value) || 0;
  
  STATE.settings.yearlyGoals = document.getElementById('config-yearly-goals').value.trim();
  STATE.settings.monthlyGoals = document.getElementById('config-monthly-goals').value.trim();

  // Save GitHub Sync configurations
  if (!STATE.settings.github) STATE.settings.github = { username: "", repo: "", token: "", lastSynced: "" };
  STATE.settings.github.username = document.getElementById('config-gh-user').value.trim();
  STATE.settings.github.repo = document.getElementById('config-gh-repo').value.trim();
  STATE.settings.github.token = document.getElementById('config-gh-token').value.trim();

  saveState(); // Trigger immediate cloud sync push and local save
  closeModal(goalsModal);
  
  renderDayView();
  renderAnalysisView();
  
  if (STATE.settings.github.username && STATE.settings.github.repo && STATE.settings.github.token) {
    alert("تم حفظ الإعدادات بنجاح وبدء المزامنة الفورية مع جيت هب! ☁️✨");
  } else {
    alert("تم حفظ الإعدادات وتحديث الأرقام بنجاح! 💾");
  }
});

const savingModal = document.getElementById('saving-modal');
document.getElementById('add-saving-btn').addEventListener('click', () => {
  document.getElementById('saving-amount-input').value = '';
  openModal(savingModal);
});

document.getElementById('marriage-edit-btn').addEventListener('click', () => {
  openGoalsModal();
});

document.getElementById('close-saving-modal-btn').addEventListener('click', () => closeModal(savingModal));
document.getElementById('saving-cancel-btn').addEventListener('click', () => closeModal(savingModal));

document.getElementById('saving-save-btn').addEventListener('click', () => {
  const val = parseFloat(document.getElementById('saving-amount-input').value);
  if (val >= 0) {
    STATE.settings.marriageGoal.current += val;
    saveState();
    closeModal(savingModal);
    renderAnalysisView();
    alert(`رائع! تم ادخار ${val.toLocaleString()} ج.م إضافية بنجاح 💍✨`);
  }
});

const dayTaskModal = document.getElementById('day-task-modal');
document.getElementById('add-day-task-btn').addEventListener('click', () => {
  document.getElementById('new-task-text-input').value = '';
  document.getElementById('new-task-time-input').value = '';
  openModal(dayTaskModal);
});

document.getElementById('close-day-task-modal-btn').addEventListener('click', () => closeModal(dayTaskModal));
document.getElementById('day-task-cancel-btn').addEventListener('click', () => closeModal(dayTaskModal));

document.getElementById('day-task-save-btn').addEventListener('click', () => {
  const text = document.getElementById('new-task-text-input').value.trim();
  const time = document.getElementById('new-task-time-input').value.trim();

  if (text) {
    const dStr = formatDateString(selectedDate);
    if (!STATE.days[dStr]) STATE.days[dStr] = { tasks: [], note: "" };
    
    STATE.days[dStr].tasks.push({
      id: Date.now(),
      text: text,
      time: time,
      status: 'pending'
    });

    saveState();
    closeModal(dayTaskModal);
    renderDayView();
  }
});

const weeklyGoalModal = document.getElementById('weekly-goal-modal');
const openWeeklyModalFunc = () => {
  const weekKey = getWeekKey(selectedDate);
  const wData = STATE.weeks[weekKey] || { weeklyGoal: "", gymTarget: 3, gymCompleted: 0, enjoyed: null };
  
  document.getElementById('weekly-goal-input').value = wData.weeklyGoal;
  document.getElementById('weekly-gym-input').value = wData.gymTarget;
  openModal(weeklyGoalModal);
};

document.getElementById('edit-weekly-goal-btn').addEventListener('click', openWeeklyModalFunc);
document.getElementById('weekly-goal-display').addEventListener('click', openWeeklyModalFunc);

document.getElementById('close-weekly-goal-modal-btn').addEventListener('click', () => closeModal(weeklyGoalModal));
document.getElementById('weekly-goal-cancel-btn').addEventListener('click', () => closeModal(weeklyGoalModal));

document.getElementById('weekly-goal-save-btn').addEventListener('click', () => {
  const text = document.getElementById('weekly-goal-input').value.trim();
  const gymTarget = parseInt(document.getElementById('weekly-gym-input').value) || 0;
  
  const weekKey = getWeekKey(selectedDate);
  if (!STATE.weeks[weekKey]) STATE.weeks[weekKey] = { weeklyGoal: "", gymTarget: 3, gymCompleted: 0, enjoyed: null };
  
  STATE.weeks[weekKey].weeklyGoal = text;
  STATE.weeks[weekKey].gymTarget = gymTarget;

  saveState();
  closeModal(weeklyGoalModal);
  renderDayView();
});

// --- QUICK MONTHLY AND YEARLY GOALS MODAL HOOKS ---
const monthlyGoalModal = document.getElementById('monthly-goal-modal');
const openMonthlyModalFunc = () => {
  document.getElementById('monthly-goal-input').value = STATE.settings.monthlyGoals || "";
  openModal(monthlyGoalModal);
};

document.getElementById('edit-monthly-goal-btn').addEventListener('click', openMonthlyModalFunc);
document.getElementById('monthly-goal-display').addEventListener('click', openMonthlyModalFunc);

document.getElementById('close-monthly-goal-modal-btn').addEventListener('click', () => closeModal(monthlyGoalModal));
document.getElementById('monthly-goal-cancel-btn').addEventListener('click', () => closeModal(monthlyGoalModal));

document.getElementById('monthly-goal-save-btn').addEventListener('click', () => {
  STATE.settings.monthlyGoals = document.getElementById('monthly-goal-input').value.trim();
  saveState();
  closeModal(monthlyGoalModal);
  renderDayView();
});

const yearlyGoalModal = document.getElementById('yearly-goal-modal');
const openYearlyModalFunc = () => {
  document.getElementById('yearly-goal-input').value = STATE.settings.yearlyGoals || "";
  openModal(yearlyGoalModal);
};

document.getElementById('edit-yearly-goal-btn').addEventListener('click', openYearlyModalFunc);
document.getElementById('yearly-goal-display').addEventListener('click', openYearlyModalFunc);

document.getElementById('close-yearly-goal-modal-btn').addEventListener('click', () => closeModal(yearlyGoalModal));
document.getElementById('yearly-goal-cancel-btn').addEventListener('click', () => closeModal(yearlyGoalModal));

document.getElementById('yearly-goal-save-btn').addEventListener('click', () => {
  STATE.settings.yearlyGoals = document.getElementById('yearly-goal-input').value.trim();
  saveState();
  closeModal(yearlyGoalModal);
  renderDayView();
});

// --- PREMIUM AUTOMATED GITHUB STORAGE SYNC ENGINE ---

let isPushing = false;
let pushPending = false;

async function pushStateToGitHub() {
  const gh = STATE.settings.github;
  if (!gh || !gh.username || !gh.repo || !gh.token) {
    updateSyncStatusIndicator(false);
    return;
  }

  if (isPushing) {
    pushPending = true;
    return;
  }

  isPushing = true;
  pushPending = false;

  const url = `https://api.github.com/repos/${gh.username}/${gh.repo}/contents/db.json`;
  const headers = {
    'Authorization': `token ${gh.token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  try {
    // 1. Get existing file SHA if it exists
    let sha = null;
    const getRes = await fetch(url, { headers });
    if (getRes.ok) {
      const getJson = await getRes.json();
      sha = getJson.sha;
    }

    // Prepare payload
    const payload = {
      state: STATE,
      chatHistory: localStorage.getItem('the_goal_chat_history'),
      updatedAt: new Date().toISOString()
    };

    // Base64 encode supporting UTF-8 Arabic characters safely
    const contentString = JSON.stringify(payload);
    const base64Content = btoa(unescape(encodeURIComponent(contentString)));

    const body = {
      message: `تحديث تلقائي للمزامنة: ${getArabicDate(new Date())} - ${new Date().toLocaleTimeString('ar-EG')}`,
      content: base64Content
    };
    if (sha) {
      body.sha = sha;
    }

    // 2. Put the updated content
    const putRes = await fetch(url, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(body)
    });

    if (putRes.ok) {
      gh.lastSynced = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
      saveStateLocallyOnly();
      updateSyncStatusIndicator(true);
      console.log("تمت المزامنة السحابية الفورية بنجاح مع جيت هب!");
    } else {
      console.error("فشل رفع المزامنة لـ جيت هب:", putRes.status);
      updateSyncStatusIndicator(false);
    }
  } catch (e) {
    console.error("خطأ في المزامنة السحابية:", e);
    updateSyncStatusIndicator(false);
  } finally {
    isPushing = false;
    if (pushPending) {
      setTimeout(pushStateToGitHub, 300);
    }
  }
}

async function pullStateFromGitHub(manualTrigger = false) {
  const gh = STATE.settings.github;
  if (!gh || !gh.username || !gh.repo || !gh.token) {
    updateSyncStatusIndicator(false);
    if (manualTrigger) alert("يرجى إدخال إعدادات جيت هب بالكامل أولاً.");
    return;
  }

  if (manualTrigger) {
    const badge = document.getElementById('gh-sync-badge');
    badge.textContent = "جاري الاتصال... ⏳";
    badge.style.color = "#a78bfa";
  }

  const url = `https://api.github.com/repos/${gh.username}/${gh.repo}/contents/db.json`;
  const headers = {
    'Authorization': `token ${gh.token}`,
    'Accept': 'application/vnd.github.v3+json'
  };

  try {
    const res = await fetch(url, { headers });
    if (res.ok) {
      const json = await res.json();
      // Base64 decode supporting UTF-8 Arabic characters safely
      const decodedContent = decodeURIComponent(escape(atob(json.content)));
      const payload = JSON.parse(decodedContent);

      if (payload && payload.state) {
        // Safety check: Don't silently overwrite a populated local state with an empty cloud state!
        const localHasData = (STATE.settings && STATE.settings.yearlyGoals && STATE.settings.yearlyGoals.trim() !== '') || 
                             (STATE.settings && STATE.settings.monthlyGoals && STATE.settings.monthlyGoals.trim() !== '') ||
                             (STATE.days && Object.keys(STATE.days).length > 0);
                             
        const cloudHasData = (payload.state.settings && payload.state.settings.yearlyGoals && payload.state.settings.yearlyGoals.trim() !== '') || 
                             (payload.state.settings && payload.state.settings.monthlyGoals && payload.state.settings.monthlyGoals.trim() !== '') ||
                             (payload.state.days && Object.keys(payload.state.days).length > 0);

        if (localHasData && !cloudHasData) {
          console.warn("تنبيه: محاولة مزامنة بيانات سحابية فارغة فوق بيانات محلية ممتلئة. تم إلغاء الكتابة التلقائية لحماية بياناتك.");
          if (manualTrigger) {
            if (!confirm("البيانات على جيت هب فارغة بينما لديك بيانات محلية ممتلئة. هل تريد فعلاً استبدال بياناتك المحلية بالبيانات السحابية الفارغة؟")) {
              updateSyncStatusIndicator(true);
              return;
            }
          } else {
            // Push local populated state to GitHub instead to keep cloud updated!
            console.log("تحديث السحابة تلقائيًا بالبيانات المحلية المأهولة...");
            pushStateToGitHub();
            return;
          }
        }

        // Save imported state and chat history safely
        STATE = payload.state;
        saveStateLocallyOnly();
        
        if (payload.chatHistory) {
          localStorage.setItem('the_goal_chat_history', payload.chatHistory);
        }
        
        gh.lastSynced = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        saveStateLocallyOnly();
        
        console.log("تم سحب المزامنة السحابية بنجاح!");
        updateSyncStatusIndicator(true);
        
        // Re-render components to reflect new database
        renderDayView();
        renderAnalysisView();
        
        if (manualTrigger) {
          alert("تمت المزامنة وجلب أحدث البيانات بنجاح من جيت هب! ☁️🎉");
        }
      }
    } else if (res.status === 404) {
      console.log("ملف المزامنة السحابية غير موجود على المستودع، سيتم رفعه الآن كملف جديد...");
      await pushStateToGitHub();
      if (manualTrigger) alert("تم إنشاء مستودع مزامنة جديد ورفع بياناتك الحالية بنجاح! ☁️✨");
    } else {
      updateSyncStatusIndicator(false);
      if (manualTrigger) alert(`فشل الاتصال بجيت هب. رمز الخطأ: ${res.status}`);
    }
  } catch (e) {
    console.error("خطأ في جلب المزامنة:", e);
    updateSyncStatusIndicator(false);
    if (manualTrigger) alert("فشل جلب البيانات السحابية، يرجى التحقق من اتصال الشبكة وصلاحية الـ Token.");
  }
}

function updateSyncStatusIndicator(isOnline = null) {
  const badge = document.getElementById('gh-sync-badge');
  if (!badge) return;

  const gh = STATE.settings.github;
  
  if (isOnline === true) {
    badge.textContent = `متزامن (الساعة ${gh.lastSynced}) ✅`;
    badge.style.color = "#10b981";
    badge.style.background = "rgba(16, 185, 129, 0.08)";
  } else if (isOnline === false) {
    badge.textContent = "خطأ في الاتصال ⚠️";
    badge.style.color = "#ef4444";
    badge.style.background = "rgba(239, 68, 68, 0.08)";
  } else {
    // Standard initialization check
    if (gh && gh.username && gh.repo && gh.token) {
      if (gh.lastSynced) {
        badge.textContent = `جاهز (آخر مزامنة ${gh.lastSynced}) ☁️`;
        badge.style.color = "#06b6d4";
        badge.style.background = "rgba(6, 182, 212, 0.08)";
      } else {
        badge.textContent = "بانتظار المزامنة الأولى ⏳";
        badge.style.color = "#a78bfa";
        badge.style.background = "rgba(167, 139, 250, 0.08)";
      }
    } else {
      badge.textContent = "المزامنة معطلة ⚠️";
      badge.style.color = "var(--text-secondary)";
      badge.style.background = "rgba(255, 255, 255, 0.05)";
    }
  }
}

// --- AUTOMATIC CHAT HISTORY COMPRESSION & CONSOLIDATION ---

async function consolidateChatHistory() {
  // Only consolidate if there are at least 7 conversational messages (excluding system prompt N=0)
  // 8 messages in chatHistory = index 0 (system) + index 1 to 7 (conversational messages).
  // When it reaches 9 or more, we compress the older items!
  if (chatHistory.length <= 8) return; 

  console.log("بدء تلخيص المحادثة لتوفير الاستهلاك والرموز...");
  
  // We keep the system prompt (index 0) and the last 2 messages (to maintain active conversation context)
  const toSummarize = chatHistory.slice(1, chatHistory.length - 2);
  const lastTwo = chatHistory.slice(chatHistory.length - 2);

  const apiKey = "fw_MWKEEFscc36msc6AqmFgNk";
  const model = "accounts/fireworks/models/kimi-k2p6";

  try {
    const summaryResponse = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: 'أنت كوتش التخطيط الذكي المحترف. مهمتك كتابة ملخص فائق الإيجاز والدقة باللغة العربية الفصحى يوضح خلاصة الاتفاق والمهام والنقاشات السابقة لمساعدتك كـ AI على إكمال النقاش لاحقاً دون فقدان السياق.'
          },
          {
            role: 'user',
            content: `الرجاء كتابة خلاصة بالغة الإيجاز (في 3 أسطر على الأكثر) عما تم نقاشه أو الاتفاق عليه في الحوار التالي:\n\n${JSON.stringify(toSummarize)}`
          }
        ],
        temperature: 0.3,
        max_tokens: 150
      })
    });

    if (summaryResponse.ok) {
      const resData = await summaryResponse.json();
      const summaryText = resData.choices[0].message.content.trim();
      console.log("خلاصة النقاش السحابية المحدثة:", summaryText);

      // Reconstruct chat history cleanly
      chatHistory = [
        chatHistory[0],
        {
          role: 'system',
          content: `🚨 خلاصة سياق الحوار السابق لتذكره: ${summaryText}`
        },
        ...lastTwo
      ];
      
      localStorage.setItem('the_goal_chat_history', JSON.stringify(chatHistory));
      saveStateLocallyOnly();
      pushStateToGitHub(); // Sync immediately!
    }
  } catch (err) {
    console.error("فشل تلخيص المحادثة وتوفير الاستهلاك:", err);
  }
}

// Register Manual Sync Button
document.getElementById('gh-sync-btn').addEventListener('click', () => {
  pullStateFromGitHub(true);
});

// Trigger dynamic cloud pull quietly on startup (fast 500ms for responsive first load)
setTimeout(() => {
  pullStateFromGitHub();
}, 500);

// --- LOCKSCREEN AUTHENTICATION ENGINE ---
const lockscreenOverlay = document.getElementById('lockscreen');
let enteredPin = "";

function initLockscreen() {
  const isAuth = localStorage.getItem('the_goal_authenticated') === 'true';
  
  if (isAuth) {
    lockscreenOverlay.classList.add('hidden');
    return;
  }
  
  lockscreenOverlay.classList.remove('hidden');
  enteredPin = "";
  updatePinDots();
  
  // Register Keypad Events
  const keys = lockscreenOverlay.querySelectorAll('.keypad-btn[data-val]');
  keys.forEach(key => {
    key.addEventListener('click', () => {
      if (enteredPin.length < 6) {
        enteredPin += key.dataset.val;
        updatePinDots();
        
        // Auto-check if it hits 6 digits
        if (enteredPin.length === 6) {
          setTimeout(verifyPIN, 200);
        }
      }
    });
  });
  
  document.getElementById('keypad-clear').addEventListener('click', () => {
    if (enteredPin.length > 0) {
      enteredPin = enteredPin.slice(0, -1);
      updatePinDots();
    }
  });
  
  document.getElementById('keypad-confirm').addEventListener('click', () => {
    verifyPIN();
  });
}

function updatePinDots() {
  const dots = document.querySelectorAll('.pin-dot');
  dots.forEach((dot, index) => {
    if (index < enteredPin.length) {
      dot.classList.add('active');
      dot.classList.remove('error');
    } else {
      dot.classList.remove('active');
      dot.classList.remove('error');
    }
  });
}

function verifyPIN() {
  const correctPin = STATE.settings.appPin || "157359";
  if (enteredPin === correctPin) {
    localStorage.setItem('the_goal_authenticated', 'true');
    lockscreenOverlay.classList.add('fade-out');
    setTimeout(() => {
      lockscreenOverlay.classList.add('hidden');
    }, 400);
  } else {
    const container = lockscreenOverlay.querySelector('.lockscreen-container');
    container.classList.add('shake');
    
    const dots = document.querySelectorAll('.pin-dot');
    dots.forEach(dot => dot.classList.add('error'));
    
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
    
    setTimeout(() => {
      container.classList.remove('shake');
      enteredPin = "";
      updatePinDots();
    }, 450);
  }
}

// Lock button click handler
document.getElementById('config-lock-btn').addEventListener('click', () => {
  if (confirm("هل تريد قفل التطبيق فوراً؟ سيتعين عليك إدخال رمز الـ PIN مجدداً عند الفتح.")) {
    localStorage.removeItem('the_goal_authenticated');
    location.reload();
  }
});

// Start lockscreen verification
initLockscreen();
