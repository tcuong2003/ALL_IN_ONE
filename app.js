/**
 * All In One Suite (AIO) - Multi-Project Central Platform
 * Modules:
 * 1. SmartBudget 100% (Rule 100% Real-time Budget Calculator)
 * 2. Compound Interest & Wealth Growth Calculator
 * 3. All In One Projects Hub
 */

// =============================================================================
// GLOBAL SUITE STATE & NAVIGATION ROUTER
// =============================================================================

const suiteState = {
  activeModule: 'budget', // 'budget', 'compound', 'hub'
  currency: 'VND'
};

const AIO_STORAGE_KEY_MODULE = 'aio_active_module';

function switchModule(moduleName) {
  suiteState.activeModule = moduleName;
  localStorage.setItem(AIO_STORAGE_KEY_MODULE, moduleName);

  // Update Navigation Tabs
  document.querySelectorAll('.aio-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === moduleName);
  });

  // Switch Module Views
  const modules = ['budget', 'compound', 'hub'];
  modules.forEach(mod => {
    const el = document.getElementById(`module-${mod}`);
    if (el) {
      if (mod === moduleName) {
        el.style.display = 'block';
        el.classList.add('active');
      } else {
        el.style.display = 'none';
        el.classList.remove('active');
      }
    }
  });

  // Module specific hooks
  if (moduleName === 'compound') {
    renderCompound();
  } else if (moduleName === 'budget') {
    render();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================================================
// FORMATTING UTILITIES (DOT SEPARATOR FOR THOUSANDS)
// =============================================================================

function formatNumberWithDots(val) {
  if (val === 0) return '0';
  if (!val && val !== 0) return '';
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function formatNumberForInput(val, currency = suiteState.currency) {
  if (val === 0) return '0';
  if (!val && val !== 0) return '';
  if (currency === 'VND') {
    return formatNumberWithDots(val);
  } else {
    return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

function formatMoney(amount, currency = suiteState.currency) {
  if (isNaN(amount) || amount === null) amount = 0;
  if (currency === 'VND') {
    return formatNumberWithDots(amount) + ' ₫';
  } else {
    return '$' + Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

function parseMoneyInput(str) {
  if (!str) return 0;
  const cleaned = str.toString().replace(/[^0-9]/g, '');
  return parseInt(cleaned, 10) || 0;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Toast notification
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');
let toastTimeout = null;

function showToast(message) {
  if (!toast || !toastMsg) return;
  if (toastTimeout) clearTimeout(toastTimeout);
  toastMsg.textContent = message;
  toast.style.display = 'flex';
  toastTimeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2600);
}

// =============================================================================
// MODULE 1: SMARTBUDGET 100% (LOGIC & STATE)
// =============================================================================

const PRESETS = {
  '50-30-20': [
    { id: 'c1', name: 'Nhu cầu thiết yếu', percent: 50, color: '#3b82f6', icon: '🏠', note: 'Tiền thuê nhà, ăn uống, điện nước, đi lại' },
    { id: 'c2', name: 'Mong muốn cá nhân', percent: 30, color: '#ec4899', icon: '🛍️', note: 'Mua sắm, cafe giải trí, du lịch, giao lưu' },
    { id: 'c3', name: 'Tiết kiệm & Đầu tư', percent: 20, color: '#10b981', icon: '📈', note: 'Quỹ khẩn cấp, tích lũy, đầu tư tương lai' }
  ],
  'jars-6': [
    { id: 'j1', name: 'Nhu cầu thiết yếu (NEC)', percent: 55, color: '#3b82f6', icon: '🏠', note: 'Ăn ở, sinh hoạt, hóa đơn hàng tháng' },
    { id: 'j2', name: 'Tự do tài chính (FFA)', percent: 10, color: '#8b5cf6', icon: '📈', note: 'Tích lũy tài sản, đầu tư thụ động' },
    { id: 'j3', name: 'Tiết kiệm dài hạn (LTSS)', percent: 10, color: '#10b981', icon: '💰', note: 'Mua nhà, xe, quỹ sự phòng khẩn cấp' },
    { id: 'j4', name: 'Phát triển bản thân (EDU)', percent: 10, color: '#f59e0b', icon: '🎓', note: 'Sách, khóa học, nâng cao chuyên môn' },
    { id: 'j5', name: 'Hưởng thụ cuộc sống (PLAY)', percent: 10, color: '#ec4899', icon: '☕', note: 'Thưởng thức ẩm thực, vui chơi cuối tuần' },
    { id: 'j6', name: 'Quỹ chia sẻ / Cho đi (GIVE)', percent: 5, color: '#06b6d4', icon: '🎁', note: 'Hiếu hỉ, quà biếu gia đình, từ thiện' }
  ],
  '70-20-10': [
    { id: 'p1', name: 'Chi tiêu sinh hoạt', percent: 70, color: '#3b82f6', icon: '🏠', note: 'Toàn bộ phí sinh hoạt hàng tháng' },
    { id: 'p2', name: 'Tiết kiệm & Đầu tư', percent: 20, color: '#10b981', icon: '📈', note: 'Tăng trưởng tài sản' },
    { id: 'p3', name: 'Học tập & Sức khỏe', percent: 10, color: '#f59e0b', icon: '🏥', note: 'Bảo hiểm, thể thao, sách' }
  ],
  '80-20': [
    { id: 'b1', name: 'Chi tiêu tổng hợp', percent: 80, color: '#3b82f6', icon: '🛒', note: 'Tất cả các khoản sinh hoạt và mong muốn' },
    { id: 'b2', name: 'Tự do tài chính', percent: 20, color: '#10b981', icon: '💰', note: 'Tích lũy tối thiểu 20% thu nhập' }
  ]
};

const state = {
  income: 20000000,
  currency: 'VND',
  activePreset: '50-30-20',
  sortBy: 'default',
  categories: JSON.parse(JSON.stringify(PRESETS['50-30-20']))
};

const STORAGE_KEY = 'smartbudget_v1_data';

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      income: state.income,
      currency: suiteState.currency,
      activePreset: state.activePreset,
      sortBy: state.sortBy,
      categories: state.categories
    }));
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (typeof data.income === 'number') state.income = data.income;
      if (data.currency) suiteState.currency = data.currency;
      if (data.activePreset) state.activePreset = data.activePreset;
      if (data.sortBy) state.sortBy = data.sortBy;
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        state.categories = data.categories;
      }
    }
  } catch (e) {
    console.warn('LocalStorage load failed:', e);
  }
}

// Elements for SmartBudget
const incomeInput = document.getElementById('income-input');
const currencySymbol = document.getElementById('currency-symbol');
const currencyBtns = document.querySelectorAll('.currency-btn');
const quickBtns = document.querySelectorAll('.quick-btn');
const quickAddBtns = document.querySelectorAll('.quick-btn-add');
const btnClearIncome = document.getElementById('btn-clear-income');

const ruleStatusBadge = document.getElementById('rule-status-badge');
const ruleStatusIcon = document.getElementById('rule-status-icon');
const ruleStatusText = document.getElementById('rule-status-text');
const totalPercentVal = document.getElementById('total-percent-val');
const ruleProgressBar = document.getElementById('rule-progress-bar');
const btnAutoFillRemaining = document.getElementById('btn-auto-fill-remaining');
const remainingPercentLabel = document.getElementById('remaining-percent-label');
const btnNormalize100 = document.getElementById('btn-normalize-100');

const presetChips = document.querySelectorAll('.preset-chip');
const categoriesContainer = document.getElementById('categories-container');
const categoryCount = document.getElementById('category-count');
const sortSelect = document.getElementById('sort-select');

// Summary elements
const summaryIncome = document.getElementById('summary-income');
const summaryAllocated = document.getElementById('summary-allocated');
const summaryRemaining = document.getElementById('summary-remaining');
const summaryRemainingLabel = document.getElementById('summary-remaining-label');

// Donut Chart elements
const donutSvg = document.getElementById('donut-svg');
const donutCenterTotal = document.getElementById('donut-center-total');
const chartLegend = document.getElementById('chart-legend');
const dailyBreakdownList = document.getElementById('daily-breakdown-list');

// Modal elements
const categoryModal = document.getElementById('category-modal');
const modalTitle = document.getElementById('modal-title');
const categoryForm = document.getElementById('category-form');
const formCategoryId = document.getElementById('form-category-id');
const formName = document.getElementById('form-name');
const formPercent = document.getElementById('form-percent');
const formCalcPreview = document.getElementById('form-calc-preview');
const formIcon = document.getElementById('form-icon');
const formColor = document.getElementById('form-color');
const formNote = document.getElementById('form-note');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const btnOpenAddModal = document.getElementById('btn-open-add-modal');
const btnQuickAddCard = document.getElementById('btn-quick-add-card');
const emojiBtns = document.querySelectorAll('.emoji-btn');
const colorCircles = document.querySelectorAll('.color-circle');

// Export & Reset
const btnExportText = document.getElementById('btn-export-text');
const btnReset = document.getElementById('btn-reset');

function getTotalPercent() {
  const sum = state.categories.reduce((acc, c) => acc + (parseFloat(c.percent) || 0), 0);
  return Math.round(sum * 10) / 10;
}

function render() {
  const totalPercent = getTotalPercent();
  const allocatedMoney = (state.income * totalPercent) / 100;
  const remainingMoney = state.income - allocatedMoney;

  // 1. Update Income Input with dot format
  if (incomeInput && document.activeElement !== incomeInput) {
    incomeInput.value = state.income === 0 ? '' : formatNumberForInput(state.income, suiteState.currency);
  }
  if (currencySymbol) {
    currencySymbol.textContent = suiteState.currency === 'VND' ? '₫' : '$';
  }

  // 2. 100% Rule Status & Badges
  if (totalPercentVal) totalPercentVal.textContent = totalPercent + '%';
  if (ruleStatusBadge) {
    ruleStatusBadge.className = 'status-badge';

    if (Math.abs(totalPercent - 100) < 0.05) {
      ruleStatusBadge.classList.add('exact');
      ruleStatusIcon.textContent = '✓';
      ruleStatusText.textContent = 'Đạt chuẩn 100% ngân sách';
      if (btnAutoFillRemaining) btnAutoFillRemaining.style.display = 'none';
    } else if (totalPercent < 100) {
      const diff = Math.round((100 - totalPercent) * 10) / 10;
      ruleStatusBadge.classList.add('under');
      ruleStatusIcon.textContent = '⚡';
      ruleStatusText.textContent = `Chưa đủ 100% (còn ${diff}%)`;
      if (btnAutoFillRemaining) {
        btnAutoFillRemaining.style.display = 'inline-flex';
        remainingPercentLabel.textContent = `${diff}%`;
      }
    } else {
      const over = Math.round((totalPercent - 100) * 10) / 10;
      ruleStatusBadge.classList.add('over');
      ruleStatusIcon.textContent = '⚠️';
      ruleStatusText.textContent = `Vượt quá 100% (thừa ${over}%)`;
      if (btnAutoFillRemaining) btnAutoFillRemaining.style.display = 'none';
    }
  }

  // 3. Segmented Progress Bar
  if (ruleProgressBar) {
    ruleProgressBar.innerHTML = '';
    state.categories.forEach(cat => {
      const seg = document.createElement('div');
      seg.className = 'bar-segment';
      seg.style.width = `${Math.min(100, Math.max(0, cat.percent))}%`;
      seg.style.backgroundColor = cat.color;
      seg.title = `${cat.name}: ${cat.percent}% (${formatMoney((state.income * cat.percent) / 100)})`;
      ruleProgressBar.appendChild(seg);
    });
  }

  // 4. Summary metrics
  if (summaryIncome) summaryIncome.textContent = formatMoney(state.income);
  if (summaryAllocated) summaryAllocated.textContent = formatMoney(allocatedMoney);
  
  if (summaryRemaining && summaryRemainingLabel) {
    if (remainingMoney >= 0) {
      summaryRemainingLabel.textContent = 'Số tiền còn lại';
      summaryRemaining.textContent = formatMoney(remainingMoney);
      summaryRemaining.className = 'stat-value text-emerald';
    } else {
      summaryRemainingLabel.textContent = 'Vượt mức chi tiêu';
      summaryRemaining.textContent = '-' + formatMoney(Math.abs(remainingMoney));
      summaryRemaining.className = 'stat-value text-rose';
    }
  }

  // 5. Render Categories Cards
  renderCategoryCards();

  // 6. Render Donut & Analytics
  renderDonutChart(totalPercent);
  renderDailyBreakdown();

  // 7. Update count
  if (categoryCount) categoryCount.textContent = state.categories.length;

  saveToStorage();
}

function getSortedCategories() {
  const list = [...state.categories];
  if (state.sortBy === 'percent-desc') {
    return list.sort((a, b) => b.percent - a.percent);
  }
  if (state.sortBy === 'percent-asc') {
    return list.sort((a, b) => a.percent - b.percent);
  }
  if (state.sortBy === 'amount-desc') {
    return list.sort((a, b) => ((state.income * b.percent) / 100) - ((state.income * a.percent) / 100));
  }
  return list;
}

function renderCategoryCards() {
  if (!categoriesContainer) return;
  categoriesContainer.innerHTML = '';
  const sorted = getSortedCategories();

  sorted.forEach(cat => {
    const amount = (state.income * cat.percent) / 100;
    const dailyAmount = amount / 30;

    const card = document.createElement('div');
    card.className = 'category-card';
    card.style.setProperty('--cat-color', cat.color);

    card.innerHTML = `
      <div class="card-top-row">
        <div class="card-title-group">
          <div class="card-icon-badge">${cat.icon || '📌'}</div>
          <div class="card-name-wrap">
            <h4 class="card-name">${escapeHtml(cat.name)}</h4>
            ${cat.note ? `<p class="card-note">${escapeHtml(cat.note)}</p>` : ''}
          </div>
        </div>
        <div class="card-actions">
          <button class="card-btn btn-edit" title="Chỉnh sửa ô này" data-id="${cat.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button class="card-btn btn-delete" title="Xóa ô này" data-id="${cat.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>

      <div class="card-amount-box">
        <div class="amount-label-row">
          <span class="amount-label">Số tiền tự động tính</span>
          <span class="daily-equiv">~${formatMoney(dailyAmount)} / ngày</span>
        </div>
        <div class="card-amount-value">${formatMoney(amount)}</div>
      </div>

      <div class="card-percent-control">
        <div class="percent-label-row">
          <span>Tỷ lệ phân bổ:</span>
          <div class="percent-stepper">
            <button class="stepper-btn btn-minus" data-id="${cat.id}">-</button>
            <input 
              type="number" 
              class="percent-input-inline" 
              value="${cat.percent}" 
              data-id="${cat.id}"
              min="0" 
              max="100" 
              step="0.5"
            />
            <button class="stepper-btn btn-plus" data-id="${cat.id}">+</button>
          </div>
        </div>
        <input 
          type="range" 
          class="percent-slider" 
          min="0" 
          max="100" 
          step="0.5" 
          value="${cat.percent}" 
          data-id="${cat.id}"
        />
      </div>
    `;

    categoriesContainer.appendChild(card);
  });

  attachCardEvents();
}

function attachCardEvents() {
  document.querySelectorAll('.percent-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const id = e.target.dataset.id;
      const val = parseFloat(e.target.value) || 0;
      updateCategoryPercent(id, val);
    });
  });

  document.querySelectorAll('.percent-input-inline').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      let val = parseFloat(e.target.value) || 0;
      if (val < 0) val = 0;
      if (val > 100) val = 100;
      updateCategoryPercent(id, val);
    });
  });

  document.querySelectorAll('.btn-minus').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const cat = state.categories.find(c => c.id === id);
      if (cat) {
        const newVal = Math.max(0, cat.percent - 1);
        updateCategoryPercent(id, newVal);
      }
    });
  });

  document.querySelectorAll('.btn-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const cat = state.categories.find(c => c.id === id);
      if (cat) {
        const newVal = Math.min(100, cat.percent + 1);
        updateCategoryPercent(id, newVal);
      }
    });
  });

  document.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditModal(btn.dataset.id);
    });
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteCategory(btn.dataset.id);
    });
  });
}

function updateCategoryPercent(id, newPercent) {
  const cat = state.categories.find(c => c.id === id);
  if (cat) {
    cat.percent = Math.round(newPercent * 10) / 10;
    render();
  }
}

function renderDonutChart(totalPercent) {
  if (!donutSvg || !chartLegend || !donutCenterTotal) return;
  donutSvg.innerHTML = '';
  chartLegend.innerHTML = '';
  donutCenterTotal.textContent = totalPercent + '%';

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bgCircle.setAttribute('cx', '100');
  bgCircle.setAttribute('cy', '100');
  bgCircle.setAttribute('r', radius.toString());
  bgCircle.setAttribute('class', 'donut-segment');
  bgCircle.setAttribute('stroke', 'rgba(255, 255, 255, 0.05)');
  donutSvg.appendChild(bgCircle);

  state.categories.forEach(cat => {
    if (cat.percent <= 0) return;

    const strokeLength = (cat.percent / 100) * circumference;
    const strokeOffset = -((accumulatedPercent / 100) * circumference);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '100');
    circle.setAttribute('cy', '100');
    circle.setAttribute('r', radius.toString());
    circle.setAttribute('class', 'donut-segment');
    circle.setAttribute('stroke', cat.color);
    circle.setAttribute('stroke-dasharray', `${strokeLength} ${circumference}`);
    circle.setAttribute('stroke-dashoffset', strokeOffset.toString());

    const titleTag = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    titleTag.textContent = `${cat.name}: ${cat.percent}% (${formatMoney((state.income * cat.percent) / 100)})`;
    circle.appendChild(titleTag);

    donutSvg.appendChild(circle);
    accumulatedPercent += cat.percent;

    const legendItem = document.createElement('div');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `
      <div class="legend-left">
        <span class="legend-dot" style="background-color: ${cat.color}"></span>
        <span class="legend-name">${cat.icon || ''} ${escapeHtml(cat.name)}</span>
      </div>
      <span class="legend-percent">${cat.percent}%</span>
    `;
    chartLegend.appendChild(legendItem);
  });
}

function renderDailyBreakdown() {
  if (!dailyBreakdownList) return;
  dailyBreakdownList.innerHTML = '';
  const sorted = [...state.categories].sort((a, b) => b.percent - a.percent);

  sorted.forEach(cat => {
    const daily = (state.income * cat.percent) / 100 / 30;
    const row = document.createElement('div');
    row.className = 'daily-row';
    row.innerHTML = `
      <span class="daily-name">${cat.icon || '•'} ${escapeHtml(cat.name)}</span>
      <span class="daily-val">~${formatMoney(daily)}/ngày</span>
    `;
    dailyBreakdownList.appendChild(row);
  });
}

function normalizeTo100() {
  const currentTotal = getTotalPercent();
  if (currentTotal === 0) return;

  state.categories.forEach(cat => {
    const adjusted = (cat.percent / currentTotal) * 100;
    cat.percent = Math.round(adjusted * 10) / 10;
  });

  const newTotal = getTotalPercent();
  if (newTotal !== 100 && state.categories.length > 0) {
    const diff = Math.round((100 - newTotal) * 10) / 10;
    let maxCat = state.categories[0];
    state.categories.forEach(c => {
      if (c.percent > maxCat.percent) maxCat = c;
    });
    maxCat.percent = Math.round((maxCat.percent + diff) * 10) / 10;
  }

  render();
  showToast('Đã tự động cân bằng toàn bộ các ô về vừa khớp 100%!');
}

function autoFillRemaining() {
  const currentTotal = getTotalPercent();
  if (currentTotal >= 100) return;

  const diff = Math.round((100 - currentTotal) * 10) / 10;
  const newCat = {
    id: 'cat_' + Date.now(),
    name: 'Quỹ dự phòng linh hoạt',
    percent: diff,
    color: '#06b6d4',
    icon: '⚡',
    note: 'Khoản tiền tự động phân bổ phần còn lại'
  };

  state.categories.push(newCat);
  render();
  showToast(`Đã thêm ô phân bổ nốt ${diff}% thành công!`);
}

function openAddModal() {
  if (!categoryModal) return;
  modalTitle.textContent = 'Thêm ô chi tiêu mới';
  formCategoryId.value = '';
  formName.value = '';
  
  const currentTotal = getTotalPercent();
  const remaining = Math.max(0, Math.round((100 - currentTotal) * 10) / 10);
  formPercent.value = remaining > 0 ? remaining : 10;

  formNote.value = '';
  selectEmoji('🏠');
  selectColor('#3b82f6');
  updateModalCalcPreview();

  categoryModal.style.display = 'flex';
  formName.focus();
}

function openEditModal(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat || !categoryModal) return;

  modalTitle.textContent = 'Chỉnh sửa ô chi tiêu';
  formCategoryId.value = cat.id;
  formName.value = cat.name;
  formPercent.value = cat.percent;
  formNote.value = cat.note || '';
  selectEmoji(cat.icon || '🏠');
  selectColor(cat.color || '#3b82f6');
  updateModalCalcPreview();

  categoryModal.style.display = 'flex';
}

function closeModal() {
  if (categoryModal) categoryModal.style.display = 'none';
}

function selectEmoji(icon) {
  formIcon.value = icon;
  emojiBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.icon === icon);
  });
}

function selectColor(color) {
  formColor.value = color;
  colorCircles.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === color);
  });
}

function updateModalCalcPreview() {
  const percent = parseFloat(formPercent.value) || 0;
  const money = (state.income * percent) / 100;
  formCalcPreview.textContent = formatMoney(money);
}

if (categoryForm) {
  categoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = formName.value.trim();
    const percent = parseFloat(formPercent.value) || 0;
    const icon = formIcon.value || '📌';
    const color = formColor.value || '#3b82f6';
    const note = formNote.value.trim();
    const editId = formCategoryId.value;

    if (!name) return;

    if (editId) {
      const cat = state.categories.find(c => c.id === editId);
      if (cat) {
        cat.name = name;
        cat.percent = percent;
        cat.icon = icon;
        cat.color = color;
        cat.note = note;
        showToast(`Đã cập nhật mục "${name}"!`);
      }
    } else {
      const newCat = {
        id: 'cat_' + Date.now(),
        name,
        percent,
        icon,
        color,
        note
      };
      state.categories.push(newCat);
      showToast(`Đã thêm mới mục "${name}"!`);
    }

    closeModal();
    render();
  });
}

function deleteCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  const name = cat ? cat.name : 'khoản chi';

  if (confirm(`Bạn có chắc muốn xóa ô "${name}" không?`)) {
    state.categories = state.categories.filter(c => c.id !== id);
    render();
    showToast(`Đã xóa ô "${name}"!`);
  }
}

function loadPreset(presetKey) {
  if (PRESETS[presetKey]) {
    state.activePreset = presetKey;
    state.categories = JSON.parse(JSON.stringify(PRESETS[presetKey]));
    
    presetChips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.preset === presetKey);
    });

    render();
    showToast(`Đã áp dụng công thức ${presetKey}!`);
  }
}

function copyBreakdownToClipboard() {
  const totalPercent = getTotalPercent();
  const lines = [
    `=== BẢNG PHÂN BỔ CHI TIÊU THÔNG MINH (Quy tắc 100%) ===`,
    `Tổng thu nhập: ${formatMoney(state.income)}`,
    `Tổng tỷ lệ: ${totalPercent}%`,
    `----------------------------------------`
  ];

  state.categories.forEach(cat => {
    const amount = (state.income * cat.percent) / 100;
    const daily = amount / 30;
    lines.push(`• [${cat.percent}%] ${cat.icon || ''} ${cat.name}: ${formatMoney(amount)} (~${formatMoney(daily)}/ngày)`);
    if (cat.note) lines.push(`  └ Ghi chú: ${cat.note}`);
  });

  lines.push(`----------------------------------------`);
  lines.push(`Tạo tự động bằng All In One Suite`);

  const fullText = lines.join('\n');
  navigator.clipboard.writeText(fullText).then(() => {
    showToast('Đã sao chép bảng chi tiêu vào bộ nhớ tạm!');
  }).catch(() => {
    const textarea = document.createElement('textarea');
    textarea.value = fullText;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('Đã sao chép vào clipboard!');
  });
}

// =============================================================================
// MODULE 2: COMPOUND INTEREST & WEALTH GROWTH CALCULATOR
// =============================================================================

const ciState = {
  initial: 20000000,
  monthly: 4000000,
  rate: 10,
  years: 15,
  period: 'monthly' // 'monthly' or 'annually'
};

const ciInitialInput = document.getElementById('ci-initial');
const ciMonthlyInput = document.getElementById('ci-monthly');
const ciRateInput = document.getElementById('ci-rate');
const ciYearsInput = document.getElementById('ci-years');
const ciRateVal = document.getElementById('ci-rate-val');
const ciYearsVal = document.getElementById('ci-years-val');
const ciSourceBadge = document.getElementById('ci-source-badge');

const ciResultTotal = document.getElementById('ci-result-total');
const ciResultPrincipal = document.getElementById('ci-result-principal');
const ciResultInterest = document.getElementById('ci-result-interest');
const ciSummaryYears = document.getElementById('ci-summary-years');
const ciBarPrincipal = document.getElementById('ci-bar-principal');
const ciBarInterest = document.getElementById('ci-bar-interest');
const ciPctPrincipal = document.getElementById('ci-pct-principal');
const ciPctInterest = document.getElementById('ci-pct-interest');
const ciMilestonesBody = document.getElementById('ci-milestones-body');
const btnSyncFromBudget = document.getElementById('btn-sync-from-budget');
const periodBtns = document.querySelectorAll('.period-btn');

function calculateCompound() {
  const P = ciState.initial;
  const PMT = ciState.monthly;
  const annualRate = ciState.rate / 100;
  const years = ciState.years;
  const isMonthly = ciState.period === 'monthly';

  let totalBalance = P;
  let totalDeposits = P;
  const milestones = [];

  const totalMonths = years * 12;
  const monthlyRate = annualRate / 12;

  for (let m = 1; m <= totalMonths; m++) {
    if (isMonthly) {
      totalBalance = totalBalance * (1 + monthlyRate) + PMT;
    } else {
      // Annual compounding
      totalBalance += PMT;
      if (m % 12 === 0) {
        totalBalance = totalBalance * (1 + annualRate);
      }
    }
    totalDeposits += PMT;

    const currentYear = m / 12;
    if (Number.isInteger(currentYear)) {
      if (
        currentYear === 1 || 
        currentYear === 3 || 
        currentYear === 5 || 
        currentYear === 10 || 
        currentYear === 15 || 
        currentYear === 20 || 
        currentYear === 25 || 
        currentYear === 30 || 
        currentYear === years
      ) {
        const interestEarned = Math.max(0, totalBalance - totalDeposits);
        milestones.push({
          year: currentYear,
          principal: totalDeposits,
          interest: interestEarned,
          total: totalBalance
        });
      }
    }
  }

  const finalTotal = Math.round(totalBalance);
  const finalPrincipal = Math.round(totalDeposits);
  const finalInterest = Math.max(0, finalTotal - finalPrincipal);

  return {
    finalTotal,
    finalPrincipal,
    finalInterest,
    milestones
  };
}

function renderCompound() {
  if (!ciResultTotal) return;

  const data = calculateCompound();

  // Prefixes
  const prefix = suiteState.currency === 'VND' ? '₫' : '$';
  const prefix1 = document.getElementById('ci-currency-prefix-1');
  const prefix2 = document.getElementById('ci-currency-prefix-2');
  if (prefix1) prefix1.textContent = prefix;
  if (prefix2) prefix2.textContent = prefix;

  // Text values
  if (ciRateVal) ciRateVal.textContent = `${ciState.rate}% / năm`;
  if (ciYearsVal) ciYearsVal.textContent = `${ciState.years} Năm`;
  if (ciSummaryYears) ciSummaryYears.textContent = ciState.years;

  ciResultTotal.textContent = formatMoney(data.finalTotal);
  ciResultPrincipal.textContent = formatMoney(data.finalPrincipal);
  ciResultInterest.textContent = formatMoney(data.finalInterest);

  // Proportions bar
  const total = data.finalTotal || 1;
  const pPct = Math.round((data.finalPrincipal / total) * 100);
  const iPct = Math.max(0, 100 - pPct);

  if (ciBarPrincipal) ciBarPrincipal.style.width = `${pPct}%`;
  if (ciBarInterest) ciBarInterest.style.width = `${iPct}%`;
  if (ciPctPrincipal) ciPctPrincipal.textContent = `Tiền gốc: ${pPct}%`;
  if (ciPctInterest) ciPctInterest.textContent = `Tiền lãi: ${iPct}%`;

  // Milestone table
  if (ciMilestonesBody) {
    ciMilestonesBody.innerHTML = '';
    data.milestones.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>Năm thứ ${m.year}</strong></td>
        <td>${formatMoney(m.principal)}</td>
        <td class="text-emerald">+${formatMoney(m.interest)}</td>
        <td><strong class="text-accent">${formatMoney(m.total)}</strong></td>
      `;
      ciMilestonesBody.appendChild(tr);
    });
  }
}

function syncFromSmartBudget() {
  // Find saving/investment category
  const savingCat = state.categories.find(c => 
    /tiết kiệm|đầu tư|tích lũy|ffa|ltss|invest|saving/i.test(c.name)
  );

  let monthlyMoney = 4000000;
  let sourceName = 'Tự nhập';

  if (savingCat) {
    monthlyMoney = Math.round((state.income * savingCat.percent) / 100);
    sourceName = `Từ mục "${savingCat.name}" (${savingCat.percent}%)`;
  } else {
    // Default 20%
    monthlyMoney = Math.round(state.income * 0.2);
    sourceName = '20% thu nhập SmartBudget';
  }

  ciState.monthly = monthlyMoney;
  if (ciMonthlyInput) {
    ciMonthlyInput.value = formatNumberForInput(monthlyMoney, suiteState.currency);
  }
  if (ciSourceBadge) {
    ciSourceBadge.textContent = sourceName;
  }

  renderCompound();
  showToast(`Đã lấy số tiền ${formatMoney(monthlyMoney)} từ SmartBudget!`);
}

// =============================================================================
// SETUP ALL EVENT LISTENERS
// =============================================================================

function setupEventListeners() {
  // 1. Suite Navigation Tabs
  document.querySelectorAll('.aio-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.module;
      switchModule(target);
    });
  });

  // Hub Switch buttons
  document.querySelectorAll('[data-switch]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchModule(btn.dataset.switch);
    });
  });

  // Banner to compound button
  const btnJumpToCompound = document.getElementById('btn-jump-to-compound');
  if (btnJumpToCompound) {
    btnJumpToCompound.addEventListener('click', () => {
      switchModule('compound');
      syncFromSmartBudget();
    });
  }

  // 2. Income typing input with live formatting using dot (.) separator
  if (incomeInput) {
    incomeInput.addEventListener('input', (e) => {
      const input = e.target;
      const originalVal = input.value;
      const cursorPosition = input.selectionStart || 0;

      const digitsBeforeCursor = originalVal.slice(0, cursorPosition).replace(/\D/g, '').length;
      const rawDigits = originalVal.replace(/\D/g, '');
      const numVal = parseInt(rawDigits, 10) || 0;
      state.income = numVal;

      if (rawDigits === '') {
        input.value = '';
      } else {
        const formatted = formatNumberForInput(numVal, suiteState.currency);
        input.value = formatted;

        let newCursorPos = 0;
        let digitCount = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            digitCount++;
          }
          if (digitCount === digitsBeforeCursor) {
            newCursorPos = i + 1;
            break;
          }
        }
        if (digitsBeforeCursor === 0) newCursorPos = 0;
        if (digitCount < digitsBeforeCursor) newCursorPos = formatted.length;

        input.setSelectionRange(newCursorPos, newCursorPos);
      }

      render();
    });
  }

  if (btnClearIncome) {
    btnClearIncome.addEventListener('click', () => {
      state.income = 0;
      render();
      if (incomeInput) incomeInput.focus();
    });
  }

  // Quick preset income buttons
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.val, 10);
      state.income = val;
      quickBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  });

  quickAddBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const add = parseInt(btn.dataset.add, 10);
      state.income += add;
      render();
    });
  });

  // Currency switch
  currencyBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currencyBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      suiteState.currency = btn.dataset.currency;
      if (incomeInput) {
        incomeInput.value = formatNumberForInput(state.income, suiteState.currency);
      }
      render();
      renderCompound();
    });
  });

  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      loadPreset(chip.dataset.preset);
    });
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderCategoryCards();
    });
  }

  if (btnNormalize100) btnNormalize100.addEventListener('click', normalizeTo100);
  if (btnAutoFillRemaining) btnAutoFillRemaining.addEventListener('click', autoFillRemaining);

  // Modal Triggers
  if (btnOpenAddModal) btnOpenAddModal.addEventListener('click', openAddModal);
  if (btnQuickAddCard) btnQuickAddCard.addEventListener('click', openAddModal);
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

  if (categoryModal) {
    categoryModal.addEventListener('click', (e) => {
      if (e.target === categoryModal) closeModal();
    });
  }

  if (formPercent) formPercent.addEventListener('input', updateModalCalcPreview);

  emojiBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      selectEmoji(btn.dataset.icon);
    });
  });

  colorCircles.forEach(btn => {
    btn.addEventListener('click', () => {
      selectColor(btn.dataset.color);
    });
  });

  if (btnExportText) btnExportText.addEventListener('click', copyBreakdownToClipboard);
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('Bạn có muốn đặt lại toàn bộ cài đặt về công thức 50/30/20 ban đầu không?')) {
        localStorage.removeItem(STORAGE_KEY);
        state.income = 20000000;
        suiteState.currency = 'VND';
        state.activePreset = '50-30-20';
        state.sortBy = 'default';
        state.categories = JSON.parse(JSON.stringify(PRESETS['50-30-20']));
        render();
        showToast('Đã đặt lại dữ liệu thành công!');
      }
    });
  }

  // Escape key to close modal
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && categoryModal && categoryModal.style.display !== 'none') {
      closeModal();
    }
  });

  // 3. Compound Calculator Listeners
  if (ciInitialInput) {
    ciInitialInput.addEventListener('input', (e) => {
      const raw = e.target.value.replace(/\D/g, '');
      const num = parseInt(raw, 10) || 0;
      ciState.initial = num;
      e.target.value = num === 0 ? '' : formatNumberForInput(num, suiteState.currency);
      renderCompound();
    });
  }

  if (ciMonthlyInput) {
    ciMonthlyInput.addEventListener('input', (e) => {
      const raw = e.target.value.replace(/\D/g, '');
      const num = parseInt(raw, 10) || 0;
      ciState.monthly = num;
      if (ciSourceBadge) ciSourceBadge.textContent = 'Tự nhập';
      e.target.value = num === 0 ? '' : formatNumberForInput(num, suiteState.currency);
      renderCompound();
    });
  }

  if (ciRateInput) {
    ciRateInput.addEventListener('input', (e) => {
      ciState.rate = parseFloat(e.target.value) || 0;
      renderCompound();
    });
  }

  if (ciYearsInput) {
    ciYearsInput.addEventListener('input', (e) => {
      ciState.years = parseInt(e.target.value, 10) || 1;
      renderCompound();
    });
  }

  // Quick chips for compound
  document.querySelectorAll('[data-ci-initial]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ci-initial]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ciState.initial = parseInt(btn.dataset.ciInitial, 10);
      if (ciInitialInput) ciInitialInput.value = formatNumberForInput(ciState.initial, suiteState.currency);
      renderCompound();
    });
  });

  document.querySelectorAll('[data-ci-monthly]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ci-monthly]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ciState.monthly = parseInt(btn.dataset.ciMonthly, 10);
      if (ciMonthlyInput) ciMonthlyInput.value = formatNumberForInput(ciState.monthly, suiteState.currency);
      if (ciSourceBadge) ciSourceBadge.textContent = 'Gợi ý nhanh';
      renderCompound();
    });
  });

  document.querySelectorAll('[data-ci-rate]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ci-rate]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ciState.rate = parseFloat(btn.dataset.ciRate);
      if (ciRateInput) ciRateInput.value = ciState.rate;
      renderCompound();
    });
  });

  document.querySelectorAll('[data-ci-years]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ci-years]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ciState.years = parseInt(btn.dataset.ciYears, 10);
      if (ciYearsInput) ciYearsInput.value = ciState.years;
      renderCompound();
    });
  });

  periodBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      periodBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ciState.period = btn.dataset.period;
      renderCompound();
    });
  });

  if (btnSyncFromBudget) {
    btnSyncFromBudget.addEventListener('click', syncFromSmartBudget);
  }
}

// Initial Boot
window.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  setupEventListeners();
  render();
  renderCompound();

  // Load last active module
  const savedMod = localStorage.getItem(AIO_STORAGE_KEY_MODULE);
  if (savedMod && ['budget', 'compound', 'hub'].includes(savedMod)) {
    switchModule(savedMod);
  }
});
