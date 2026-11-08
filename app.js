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

const AIO_STORAGE_KEY_USER_PROFILE = 'aio_active_user_profile';
let currentUserProfile = localStorage.getItem(AIO_STORAGE_KEY_USER_PROFILE) || 'anh';

const suiteState = {
  activeModule: 'budget', // 'budget', 'compound', 'hub'
  currency: 'VND',
  activeUser: currentUserProfile
};

function getUserStorageKey(baseKey) {
  return `${baseKey}_${currentUserProfile}`;
}

const AIO_STORAGE_KEY_MODULE = 'aio_active_module';

// =============================================================================
// FIREBASE REALTIME DATABASE CLOUD SYNC ENGINE (SINGAPORE)
// =============================================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCnAKi_0EfcWTXd5Joc4UDMiSlDuly7yLk",
  authDomain: "all-in-one-86a90.firebaseapp.com",
  databaseURL: "https://all-in-one-86a90-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "all-in-one-86a90",
  storageBucket: "all-in-one-86a90.firebasestorage.app",
  messagingSenderId: "1001938782693",
  appId: "1:1001938782693:web:cc1a94c324eb54ba6e470c"
};

const CLIENT_SESSION_ID = 'client_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
let cloudDb = null;
let isRemoteUpdating = false;
let cloudSyncTimeout = null;
let hasInitialCloudSyncLoaded = false;

function safeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'object') return Object.values(val);
  return [];
}

function markProfileLocallyUpdated(profile) {
  const ts = Date.now();
  localStorage.setItem(`aio_updatedAt_${profile}`, ts.toString());
  return ts;
}

function updateSyncStatusUI(status, text) {
  const ind = document.getElementById('sync-status-indicator');
  const txt = document.getElementById('sync-status-text');
  if (ind) {
    ind.className = 'sync-status-indicator';
    if (status === 'live') ind.classList.add('pulse-live');
    else if (status === 'syncing') ind.classList.add('syncing');
    else if (status === 'offline') ind.classList.add('offline');
  }
  if (txt && text) txt.textContent = text;
}

function initCloudSync() {
  try {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not loaded.');
      updateSyncStatusUI('offline', 'Offline');
      return;
    }

    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    cloudDb = firebase.database();

    // Check real-time connection status to Firebase cluster
    const connectedRef = cloudDb.ref('.info/connected');
    connectedRef.on('value', snap => {
      if (snap.val() === true) {
        updateSyncStatusUI('live', 'Cloud Live');
      } else {
        updateSyncStatusUI('offline', 'Offline');
      }
    });

    // Listen to real-time changes on aio_cloud_suite
    const suiteRef = cloudDb.ref('aio_cloud_suite');
    suiteRef.on('value', snapshot => {
      const data = snapshot.val();
      if (!data) {
        // Initial setup on brand new cloud database: seed ONLY if local has actual data
        hasInitialCloudSyncLoaded = true;
        const localAnh = localStorage.getItem('smartbudget_v1_data_anh') || localStorage.getItem('smartbudget_v1_data');
        const localEm = localStorage.getItem('smartbudget_v1_data_em');
        if (localAnh || localEm) {
          pushFullLocalDataToCloud();
        }
        return;
      }

      if (!isRemoteUpdating) {
        applyRemoteCloudData(data);
      }
      hasInitialCloudSyncLoaded = true;
    });

    const statusBadge = document.getElementById('cloud-sync-status');
    if (statusBadge) {
      statusBadge.addEventListener('click', () => {
        showToast('☁️ Firebase Cloud Live: Đang đồng bộ thời gian thực giữa Điện thoại & Máy tính!');
      });
    }
  } catch (err) {
    console.error('Firebase init error:', err);
    updateSyncStatusUI('offline', 'Offline');
  }
}

function applyRemoteCloudData(cloudData) {
  if (!cloudData) return;

  let anhChanged = false;
  let emChanged = false;

  ['anh', 'em'].forEach(profile => {
    const remote = cloudData[profile];
    if (!remote) return;

    // Ignore echo from this browser session
    if (remote.updatedBy === CLIENT_SESSION_ID) return;

    let profileModified = false;

    // 1. Budget
    if (remote.budget) {
      const budgetObj = {
        income: typeof remote.budget.income === 'number' ? remote.budget.income : 0,
        currency: remote.budget.currency || 'VND',
        activePreset: remote.budget.activePreset || '50-30-20',
        sortBy: remote.budget.sortBy || 'default',
        categories: safeArray(remote.budget.categories)
      };
      const cur = localStorage.getItem(`smartbudget_v1_data_${profile}`);
      const incoming = JSON.stringify(budgetObj);
      if (cur !== incoming) {
        localStorage.setItem(`smartbudget_v1_data_${profile}`, incoming);
        profileModified = true;
      }
    }

    // 2. Apple Notes: Merge by ID
    const incomingNotes = safeArray(remote.notes);
    const curNotesRaw = localStorage.getItem(`aio_apple_notes_data_${profile}`);
    const localNotes = safeArray(curNotesRaw ? JSON.parse(curNotesRaw) : []);
    const deletedNotesKey = `aio_deleted_note_ids_${profile}`;
    const deletedNoteIds = new Set(safeArray(JSON.parse(localStorage.getItem(deletedNotesKey) || '[]')));

    const notesMap = new Map();
    incomingNotes.forEach(n => {
      if (n && n.id && !deletedNoteIds.has(n.id)) {
        notesMap.set(n.id, n);
      }
    });
    localNotes.forEach(n => {
      if (n && n.id && !deletedNoteIds.has(n.id) && !notesMap.has(n.id)) {
        notesMap.set(n.id, n);
      }
    });
    const mergedNotes = Array.from(notesMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const inNotesStr = JSON.stringify(mergedNotes);
    if (curNotesRaw !== inNotesStr) {
      localStorage.setItem(`aio_apple_notes_data_${profile}`, inNotesStr);
      profileModified = true;
    }

    // 3. Ledger Transactions: Merge by ID (Never lose remote transactions!)
    const incomingTx = safeArray(remote.ledger?.transactions);
    const curTxRaw = localStorage.getItem(`aio_komorebi_ledger_data_${profile}`);
    const localTx = safeArray(curTxRaw ? JSON.parse(curTxRaw) : []);
    const deletedTxKey = `aio_deleted_tx_ids_${profile}`;
    const deletedTxIds = new Set(safeArray(JSON.parse(localStorage.getItem(deletedTxKey) || '[]')));

    const txMap = new Map();
    // Ingest all incoming remote transactions
    incomingTx.forEach(t => {
      if (t && t.id && !deletedTxIds.has(t.id)) {
        txMap.set(t.id, t);
      }
    });
    // Preserve any local un-synced transactions
    localTx.forEach(t => {
      if (t && t.id && !deletedTxIds.has(t.id) && !txMap.has(t.id)) {
        txMap.set(t.id, t);
      }
    });
    const mergedTx = Array.from(txMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id || '').localeCompare(a.id || ''));
    const inTxStr = JSON.stringify(mergedTx);
    if (curTxRaw !== inTxStr) {
      localStorage.setItem(`aio_komorebi_ledger_data_${profile}`, inTxStr);
      profileModified = true;
    }

    // 4. Ledger Budget Limits
    const incomingBg = remote.ledger?.budgetLimits || {};
    const curBg = localStorage.getItem(`aio_komorebi_budget_limits_${profile}`);
    const inBgStr = JSON.stringify(incomingBg);
    if (curBg !== inBgStr) {
      localStorage.setItem(`aio_komorebi_budget_limits_${profile}`, inBgStr);
      profileModified = true;
    }

    if (profileModified) {
      const remoteUpdatedAt = Number(remote.updatedAt || Date.now());
      localStorage.setItem(`aio_updatedAt_${profile}`, remoteUpdatedAt.toString());
      if (profile === 'anh') anhChanged = true;
      if (profile === 'em') emChanged = true;
    }
  });

  const shouldRefreshUI = (anhChanged && currentUserProfile === 'anh') || (emChanged && currentUserProfile === 'em');

  if (shouldRefreshUI) {
    isRemoteUpdating = true;
    try {
      loadFromStorage();
      loadNotesFromStorage();
      loadLedgerFromStorage();

      const incInput = document.getElementById('income-input');
      if (incInput && document.activeElement !== incInput) {
        incInput.value = state.income === 0 ? '' : formatNumberForInput(state.income, suiteState.currency);
      }
      updateCurrencyDisplay();
      if (typeof renderPresetChips === 'function') renderPresetChips();
      render();
      if (typeof renderNotesApp === 'function') renderNotesApp();
      if (typeof renderLedgerApp === 'function') renderLedgerApp();
      if (typeof renderCompound === 'function') renderCompound();
    } catch (err) {
      console.warn('UI refresh error on remote sync:', err);
    } finally {
      setTimeout(() => {
        isRemoteUpdating = false;
      }, 300);
    }

    updateSyncStatusUI('live', 'Cloud Live');
  }
}

function triggerCloudSyncDebounced(delay = 400, profileToPush = currentUserProfile) {
  if (isRemoteUpdating) return;
  if (!cloudDb) return;
  if (!hasInitialCloudSyncLoaded) return;
  updateSyncStatusUI('syncing', 'Đang lưu...');
  clearTimeout(cloudSyncTimeout);
  cloudSyncTimeout = setTimeout(() => {
    pushProfileDataToCloud(profileToPush);
  }, delay);
}

function pushProfileDataToCloud(profile) {
  if (!cloudDb) return;
  try {
    let budgetRaw = localStorage.getItem(`smartbudget_v1_data_${profile}`);
    if (!budgetRaw && profile === 'anh') {
      budgetRaw = localStorage.getItem('smartbudget_v1_data');
    }
    let notesRaw = localStorage.getItem(`aio_apple_notes_data_${profile}`);
    if (!notesRaw && profile === 'anh') {
      notesRaw = localStorage.getItem('aio_apple_notes_data');
    }
    let ledgerTxRaw = localStorage.getItem(`aio_komorebi_ledger_data_${profile}`);
    if (!ledgerTxRaw && profile === 'anh') {
      ledgerTxRaw = localStorage.getItem('aio_komorebi_ledger_data');
    }
    let ledgerBgRaw = localStorage.getItem(`aio_komorebi_budget_limits_${profile}`);
    if (!ledgerBgRaw && profile === 'anh') {
      ledgerBgRaw = localStorage.getItem('aio_komorebi_budget_limits');
    }

    let budgetObj = null;
    if (budgetRaw) {
      budgetObj = JSON.parse(budgetRaw);
      budgetObj.categories = safeArray(budgetObj.categories);
    } else if (profile === currentUserProfile && typeof state !== 'undefined') {
      budgetObj = {
        income: state.income,
        currency: suiteState.currency,
        activePreset: state.activePreset,
        sortBy: state.sortBy,
        categories: safeArray(state.categories)
      };
    }

    const payload = {
      budget: budgetObj || {
        income: 0,
        currency: 'VND',
        activePreset: '50-30-20',
        sortBy: 'default',
        categories: []
      },
      notes: notesRaw ? safeArray(JSON.parse(notesRaw)) : [],
      ledger: {
        transactions: ledgerTxRaw ? safeArray(JSON.parse(ledgerTxRaw)) : [],
        budgetLimits: ledgerBgRaw ? JSON.parse(ledgerBgRaw) : {}
      },
      updatedAt: Number(localStorage.getItem(`aio_updatedAt_${profile}`) || Date.now()),
      updatedBy: CLIENT_SESSION_ID
    };

    cloudDb.ref(`aio_cloud_suite/${profile}`).set(payload, (err) => {
      if (err) {
        console.error('Cloud push failed:', err);
        updateSyncStatusUI('offline', 'Lỗi mạng');
      } else {
        updateSyncStatusUI('live', 'Cloud Live');
      }
    });
  } catch (e) {
    console.error('Error in pushProfileDataToCloud:', e);
  }
}

function pushFullLocalDataToCloud() {
  pushProfileDataToCloud('anh');
  pushProfileDataToCloud('em');
}

function switchModule(moduleName) {
  suiteState.activeModule = moduleName;
  localStorage.setItem(AIO_STORAGE_KEY_MODULE, moduleName);

  // Synchronize Tab Theme on Body & Root for Harmonious Per-Tab Backgrounds
  document.body.setAttribute('data-tab', moduleName);
  document.documentElement.setAttribute('data-active-tab', moduleName);

  // Update Navigation Tabs
  document.querySelectorAll('.aio-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === moduleName);
  });

  // Switch Module Views
  const modules = ['budget', 'compound', 'hub', 'notes', 'ledger'];
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
    loadFromStorage();
    render();
  } else if (moduleName === 'notes') {
    loadNotesFromStorage();
    renderNotesApp();
  } else if (moduleName === 'ledger') {
    loadLedgerFromStorage();
    renderLedgerApp();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// =============================================================================
// COUPLE PROFILE SYSTEM (Anh ❤️ Em)
// =============================================================================

function updateCurrencyDisplay() {
  if (typeof currencyBtns !== 'undefined' && currencyBtns) {
    currencyBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.currency === suiteState.currency);
    });
  }
  if (typeof currencySymbol !== 'undefined' && currencySymbol) {
    currencySymbol.textContent = suiteState.currency === 'USD' ? '$' : '₫';
  }
}

function switchUserProfile(newProfile) {
  if (currentUserProfile === newProfile) return;

  // Change active profile
  currentUserProfile = newProfile;
  suiteState.activeUser = newProfile;
  localStorage.setItem(AIO_STORAGE_KEY_USER_PROFILE, newProfile);
  document.body.setAttribute('data-user-profile', newProfile);
  document.documentElement.setAttribute('data-user-profile', newProfile);

  // 3. Update tabs UI
  const anhBtn = document.getElementById('tab-profile-anh');
  const emBtn = document.getElementById('tab-profile-em');
  if (anhBtn && emBtn) {
    anhBtn.classList.toggle('active', newProfile === 'anh');
    emBtn.classList.toggle('active', newProfile === 'em');
    anhBtn.setAttribute('aria-selected', newProfile === 'anh');
    emBtn.setAttribute('aria-selected', newProfile === 'em');
  }

  // 4. Load target profile data
  loadFromStorage();
  loadNotesFromStorage();
  loadLedgerFromStorage();

  // 5. Re-render SmartBudget
  if (incomeInput) {
    incomeInput.value = state.income === 0 ? '' : formatNumberForInput(state.income, suiteState.currency);
  }
  updateCurrencyDisplay();
  if (typeof renderPresetChips === 'function') renderPresetChips();
  render();

  // 6. Re-render Notes
  if (typeof renderNotesApp === 'function') {
    renderNotesApp();
  }

  // 7. Re-render Ledger
  if (typeof renderLedgerApp === 'function') {
    renderLedgerApp();
  }
  if (typeof updateReminderUIState === 'function' && updateReminderUIState) {
    updateReminderUIState();
  }

  // 8. Re-render Compound
  if (typeof renderCompound === 'function') {
    renderCompound();
  }

  showToast(`Đã chuyển sang không gian của ${newProfile === 'anh' ? 'Anh 👨' : 'Em 👩'}!`);
}

function initCoupleProfileSwitcher() {
  const anhBtn = document.getElementById('tab-profile-anh');
  const emBtn = document.getElementById('tab-profile-em');
  const toggleHeartBtn = document.getElementById('btn-toggle-heart');

  if (anhBtn && emBtn) {
    anhBtn.classList.toggle('active', currentUserProfile === 'anh');
    emBtn.classList.toggle('active', currentUserProfile === 'em');
    anhBtn.setAttribute('aria-selected', currentUserProfile === 'anh');
    emBtn.setAttribute('aria-selected', currentUserProfile === 'em');

    anhBtn.addEventListener('click', () => switchUserProfile('anh'));
    emBtn.addEventListener('click', () => switchUserProfile('em'));
  }

  if (toggleHeartBtn) {
    toggleHeartBtn.addEventListener('click', () => {
      switchUserProfile(currentUserProfile === 'anh' ? 'em' : 'anh');
    });
  }

  document.body.setAttribute('data-user-profile', currentUserProfile);
  document.documentElement.setAttribute('data-user-profile', currentUserProfile);
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

// Custom Centered Floating Confirm & Alert Dialog (Sync UI, No Native Alert/Confirm)
function showConfirmModal({
  title = 'Xác nhận',
  message = 'Bạn có chắc chắn muốn thực hiện hành động này?',
  confirmText = 'Đồng ý',
  cancelText = 'Hủy bỏ',
  type = 'danger', // 'danger' | 'warning' | 'primary'
  icon = '🗑️'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('aio-confirm-modal');
    if (!modal) {
      resolve(window.confirm(message));
      return;
    }

    const titleEl = document.getElementById('aio-confirm-title');
    const msgEl = document.getElementById('aio-confirm-message');
    const iconEl = document.getElementById('aio-confirm-icon');
    const okBtn = document.getElementById('aio-confirm-ok');
    const cancelBtn = document.getElementById('aio-confirm-cancel');

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (iconEl) {
      iconEl.innerHTML = icon;
      iconEl.className = 'aio-confirm-icon-box ' + (type === 'danger' ? 'is-danger' : type === 'warning' ? 'is-warning' : 'is-primary');
    }
    if (okBtn) {
      okBtn.textContent = confirmText;
      okBtn.className = 'btn-aio-dialog btn-aio-ok ' + (type === 'danger' ? 'btn-danger' : 'btn-primary');
    }
    if (cancelBtn) {
      cancelBtn.textContent = cancelText;
      cancelBtn.style.display = cancelText ? 'inline-flex' : 'none';
    }

    modal.style.display = 'flex';
    if (okBtn) okBtn.focus();

    function cleanUp(result) {
      modal.style.display = 'none';
      window.removeEventListener('keydown', handleKey);
      modal.removeEventListener('click', handleBackdrop);
      if (okBtn) okBtn.removeEventListener('click', handleOk);
      if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
      resolve(result);
    }

    function handleOk() { cleanUp(true); }
    function handleCancel() { cleanUp(false); }
    function handleBackdrop(e) {
      if (e.target === modal) cleanUp(false);
    }
    function handleKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanUp(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        cleanUp(true);
      }
    }

    if (okBtn) okBtn.addEventListener('click', handleOk);
    if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
    modal.addEventListener('click', handleBackdrop);
    window.addEventListener('keydown', handleKey);
  });
}

function showAlertModal({
  title = 'Thông báo',
  message = '',
  buttonText = 'Đã hiểu',
  icon = '⚠️'
} = {}) {
  return showConfirmModal({
    title,
    message,
    confirmText: buttonText,
    cancelText: null,
    type: 'warning',
    icon
  });
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
  income: 0,
  currency: 'VND',
  activePreset: '50-30-20',
  sortBy: 'default',
  categories: []
};

const STORAGE_KEY = 'smartbudget_v1_data';

function saveToStorage() {
  try {
    const key = getUserStorageKey(STORAGE_KEY);
    localStorage.setItem(key, JSON.stringify({
      income: state.income,
      currency: suiteState.currency,
      activePreset: state.activePreset,
      sortBy: state.sortBy,
      categories: safeArray(state.categories)
    }));
    markProfileLocallyUpdated(currentUserProfile);
    if (typeof triggerCloudSyncDebounced === 'function') {
      triggerCloudSyncDebounced(150, currentUserProfile);
    }
  } catch (e) {
    console.warn('LocalStorage save failed:', e);
  }
}

function loadFromStorage() {
  try {
    const key = getUserStorageKey(STORAGE_KEY);
    let raw = localStorage.getItem(key);
    // Backward compatibility for Anh profile
    if (!raw && currentUserProfile === 'anh') {
      raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(key, raw);
    }

    if (raw) {
      const data = JSON.parse(raw);
      if (typeof data.income === 'number') state.income = data.income;
      if (data.currency) suiteState.currency = data.currency;
      if (data.activePreset) state.activePreset = data.activePreset;
      if (data.sortBy) state.sortBy = data.sortBy;
      state.categories = safeArray(data.categories);
    } else {
      state.income = 0;
      suiteState.currency = 'VND';
      state.activePreset = '50-30-20';
      state.sortBy = 'default';
      state.categories = [];
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

  if (sorted.length === 0) {
    categoriesContainer.innerHTML = `
      <div class="empty-categories-card" style="grid-column: 1 / -1; padding: 36px 20px; text-align: center; background: var(--bg-card); border: 2px dashed var(--border-subtle); border-radius: var(--radius-md);">
        <div style="font-size: 2.2rem; margin-bottom: 10px;">📊</div>
        <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-primary); margin-bottom: 6px;">Chưa có khoản chi tiêu nào</div>
        <p style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 18px; max-width: 440px; margin-left: auto; margin-right: auto;">
          Bấm nút bên dưới để tạo khoản chi mới hoặc chọn một công thức phổ biến ở trên (50/30/20, 6 Chiếc Lọ).
        </p>
        <button type="button" class="btn btn-primary" id="btn-empty-add-card" style="display: inline-flex; align-items: center; gap: 8px; margin: 0 auto; padding: 10px 20px; font-weight: 600;">
          <span>➕ Thêm ô chi tiêu mới</span>
        </button>
      </div>
    `;
    const btnEmptyAdd = document.getElementById('btn-empty-add-card');
    if (btnEmptyAdd) btnEmptyAdd.addEventListener('click', openAddModal);
    return;
  }

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
    saveToStorage();
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
  bgCircle.setAttribute('class', 'donut-segment donut-segment-track');
  bgCircle.setAttribute('stroke', (document.documentElement.getAttribute('data-theme') === 'dark') ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)');
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

  if (state.categories.length === 0) {
    chartLegend.innerHTML = '<p style="color: var(--text-muted); font-size: 0.82rem; text-align: center; padding: 12px 0;">Chưa có danh mục</p>';
  }
}

function renderDailyBreakdown() {
  if (!dailyBreakdownList) return;
  dailyBreakdownList.innerHTML = '';
  const sorted = [...state.categories].sort((a, b) => b.percent - a.percent);

  if (sorted.length === 0) {
    dailyBreakdownList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.82rem; text-align: center; padding: 12px 0;">Chưa có dữ liệu</p>';
    return;
  }

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

  saveToStorage();
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
  saveToStorage();
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
    saveToStorage();
    render();
  });
}

async function deleteCategory(id) {
  const cat = state.categories.find(c => c.id === id);
  const name = cat ? cat.name : 'khoản chi';

  const confirmed = await showConfirmModal({
    title: 'Xóa khoản phân bổ',
    message: `Bạn có chắc chắn muốn xóa ô "${name}" không?`,
    confirmText: 'Xóa ô này',
    cancelText: 'Hủy bỏ',
    type: 'danger',
    icon: '🗑️'
  });
  if (!confirmed) return;

  state.categories = state.categories.filter(c => c.id !== id);
  saveToStorage();
  render();
  showToast(`Đã xóa ô "${name}"!`);
}

function loadPreset(presetKey) {
  if (PRESETS[presetKey]) {
    state.activePreset = presetKey;
    state.categories = JSON.parse(JSON.stringify(PRESETS[presetKey]));
    
    presetChips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.preset === presetKey);
    });

    saveToStorage();
    render();
    showToast(`Đã áp dụng công thức ${presetKey}!`);
  }
}

function copyBreakdownToClipboard() {
  const totalPercent = getTotalPercent();
  const userTag = currentUserProfile === 'anh' ? 'ANH 👨' : 'EM 👩';
  const lines = [
    `=== BẢNG PHÂN BỔ CHI TIÊU THÔNG MINH (${userTag}) ===`,
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
  initial: 0,
  monthly: 0,
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

  if (ciResultTotal) ciResultTotal.textContent = formatMoney(data.finalTotal);
  if (ciResultPrincipal) ciResultPrincipal.textContent = formatMoney(data.finalPrincipal);
  if (ciResultInterest) ciResultInterest.textContent = formatMoney(data.finalInterest);

  if (ciInitialInput && document.activeElement !== ciInitialInput) {
    ciInitialInput.value = ciState.initial === 0 ? '' : formatNumberForInput(ciState.initial, suiteState.currency);
  }
  if (ciMonthlyInput && document.activeElement !== ciMonthlyInput) {
    ciMonthlyInput.value = ciState.monthly === 0 ? '' : formatNumberForInput(ciState.monthly, suiteState.currency);
  }

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

      saveToStorage();
      render();
    });
  }

  if (btnClearIncome) {
    btnClearIncome.addEventListener('click', () => {
      state.income = 0;
      saveToStorage();
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
      saveToStorage();
      render();
    });
  });

  quickAddBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const add = parseInt(btn.dataset.add, 10);
      state.income += add;
      saveToStorage();
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
      saveToStorage();
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
      saveToStorage();
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
    btnReset.addEventListener('click', async () => {
      const userLabel = currentUserProfile === 'anh' ? 'của Anh' : 'của Em';
      const confirmed = await showConfirmModal({
        title: 'Đặt lại ngân sách',
        message: `Bạn có muốn xóa sạch toàn bộ cài đặt phân bổ ${userLabel} không? Hành động này sẽ đưa bảng phân bổ về trống.`,
        confirmText: 'Xóa sạch',
        cancelText: 'Hủy bỏ',
        type: 'danger',
        icon: '⚠️'
      });
      if (!confirmed) return;

      state.income = 0;
      suiteState.currency = 'VND';
      state.activePreset = '50-30-20';
      state.sortBy = 'default';
      state.categories = [];
      saveToStorage();
      render();
      showToast(`Đã làm trống dữ liệu ${userLabel} thành công!`);
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

// =============================================================================
// MODULE 3: APPLE NOTES PRO (STATE & ENGINE)
// =============================================================================

const NOTES_STORAGE_KEY = 'aio_apple_notes_data';

const DEFAULT_STARTER_NOTES = [];
const DEFAULT_STARTER_NOTES_EM = [];

const notesState = {
  notes: [],
  activeNoteId: null,
  activeFolder: 'all',
  searchQuery: ''
};

function loadNotesFromStorage() {
  try {
    const key = getUserStorageKey(NOTES_STORAGE_KEY);
    let raw = localStorage.getItem(key);
    if (!raw && currentUserProfile === 'anh') {
      raw = localStorage.getItem(NOTES_STORAGE_KEY);
      if (raw) localStorage.setItem(key, raw);
    }

    if (raw) {
      const data = JSON.parse(raw);
      notesState.notes = safeArray(data);
    } else {
      notesState.notes = [];
    }
  } catch (e) {
    console.warn('Failed to load notes:', e);
    notesState.notes = [];
  }

  if (notesState.notes.length > 0) {
    notesState.activeNoteId = notesState.notes[0].id;
  } else {
    notesState.activeNoteId = null;
  }
}

function saveNotesToStorage() {
  try {
    const key = getUserStorageKey(NOTES_STORAGE_KEY);
    localStorage.setItem(key, JSON.stringify(safeArray(notesState.notes)));
    markProfileLocallyUpdated(currentUserProfile);
    if (typeof triggerCloudSyncDebounced === 'function') {
      triggerCloudSyncDebounced(500, currentUserProfile);
    }
  } catch (e) {
    console.warn('Failed to save notes:', e);
  }
}

function formatNoteDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const now = new Date();
  
  const isToday = d.toDateString() === now.toDateString();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  if (isToday) {
    return `${hours}:${minutes}`;
  }
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Hôm qua';
  }
  
  return `${d.getDate()} Th${d.getMonth() + 1}`;
}

function formatFullTimestamp(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const day = d.getDate();
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} Tháng ${month}, ${year} lúc ${hours}:${minutes}`;
}

function getFolderBadge(folderKey) {
  switch (folderKey) {
    case 'budget': return { name: 'SmartBudget', icon: '⚡', color: '#6366f1' };
    case 'compound': return { name: 'Lãi Kép', icon: '📈', color: '#10b981' };
    case 'personal': return { name: 'Ý tưởng', icon: '💡', color: '#f59e0b' };
    default: return { name: 'Chung', icon: '📁', color: '#a855f7' };
  }
}

function renderNotesApp() {
  updateFolderCounts();
  renderNotesList();
  renderActiveNote();
}

function updateFolderCounts() {
  const countAll = document.getElementById('count-all');
  const countBudget = document.getElementById('count-budget');
  const countCompound = document.getElementById('count-compound');
  const countPersonal = document.getElementById('count-personal');

  if (countAll) countAll.textContent = notesState.notes.length;
  if (countBudget) countBudget.textContent = notesState.notes.filter(n => n.folder === 'budget').length;
  if (countCompound) countCompound.textContent = notesState.notes.filter(n => n.folder === 'compound').length;
  if (countPersonal) countPersonal.textContent = notesState.notes.filter(n => n.folder === 'personal').length;
}

function getFilteredNotes() {
  let list = [...notesState.notes];

  if (notesState.activeFolder !== 'all') {
    list = list.filter(n => n.folder === notesState.activeFolder);
  }

  if (notesState.searchQuery.trim()) {
    const q = notesState.searchQuery.toLowerCase();
    list = list.filter(n => 
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.content && n.content.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  return list;
}

function renderNotesList() {
  const container = document.getElementById('notes-items-container');
  if (!container) return;

  const filtered = getFilteredNotes();
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="notes-empty-state">
        <span class="empty-icon">📝</span>
        <p class="empty-title">Không tìm thấy ghi chú</p>
        <p class="empty-desc">Bấm nút "Ghi chú mới" ở trên để bắt đầu soạn thảo.</p>
      </div>
    `;
    return;
  }

  const pinnedList = filtered.filter(n => n.isPinned);
  const regularList = filtered.filter(n => !n.isPinned);

  if (pinnedList.length > 0) {
    const pinnedHeader = document.createElement('div');
    pinnedHeader.className = 'notes-section-heading';
    pinnedHeader.innerHTML = `<span>📌 ĐÃ GHIM</span>`;
    container.appendChild(pinnedHeader);

    pinnedList.forEach(note => {
      container.appendChild(createNoteListItemElement(note));
    });
  }

  if (regularList.length > 0) {
    if (pinnedList.length > 0) {
      const regularHeader = document.createElement('div');
      regularHeader.className = 'notes-section-heading';
      regularHeader.innerHTML = `<span>GHI CHÚ</span>`;
      container.appendChild(regularHeader);
    }

    regularList.forEach(note => {
      container.appendChild(createNoteListItemElement(note));
    });
  }
}

function createNoteListItemElement(note) {
  const item = document.createElement('div');
  item.className = 'note-list-item';
  if (note.id === notesState.activeNoteId) {
    item.classList.add('active');
  }

  const badge = getFolderBadge(note.folder);
  const plainText = (note.content || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  const snippet = plainText || 'Không có nội dung bổ sung';
  const displayTitle = (note.title || '').trim() || 'Ghi chú mới';

  item.innerHTML = `
    <div class="note-item-top">
      <h4 class="note-item-title">${escapeHtml(displayTitle)}</h4>
      ${note.isPinned ? '<span class="note-item-pin" title="Đã ghim">📌</span>' : ''}
    </div>
    <div class="note-item-meta">
      <span class="note-item-date">${formatNoteDate(note.updatedAt)}</span>
      <span class="note-item-snippet">${escapeHtml(snippet)}</span>
    </div>
  `;

  item.addEventListener('click', () => {
    selectNote(note.id);
  });

  return item;
}

function selectNote(noteId) {
  notesState.activeNoteId = noteId;
  renderNotesList();
  renderActiveNote();

  // Mobile navigation
  const appEl = document.getElementById('apple-notes-app');
  if (appEl) {
    appEl.classList.add('mobile-show-editor');
  }
}

function renderActiveNote() {
  const note = notesState.notes.find(n => n.id === notesState.activeNoteId);

  const titleInput = document.getElementById('note-title-input');
  const timestampEl = document.getElementById('note-timestamp');
  const bodyEditor = document.getElementById('note-body-editor');
  const folderSelect = document.getElementById('note-folder-select');
  const pinIcon = document.getElementById('pin-icon');
  const charCount = document.getElementById('char-count');
  const btnTogglePin = document.getElementById('btn-toggle-pin');

  if (!note) {
    if (titleInput) titleInput.value = '';
    if (timestampEl) timestampEl.textContent = '--:--';
    if (bodyEditor) bodyEditor.innerHTML = '<div style="color: var(--text-muted); padding: 20px 0;">Chọn một ghi chú bên trái hoặc bấm "Ghi chú mới" để bắt đầu.</div>';
    if (charCount) charCount.textContent = '0 từ';
    return;
  }

  if (titleInput && document.activeElement !== titleInput) {
    titleInput.value = note.title || '';
  }

  if (timestampEl) {
    timestampEl.textContent = formatFullTimestamp(note.updatedAt);
  }

  if (folderSelect) {
    folderSelect.value = note.folder || 'all';
  }

  if (btnTogglePin && pinIcon) {
    btnTogglePin.classList.toggle('active', !!note.isPinned);
    pinIcon.textContent = note.isPinned ? '📌' : '📍';
  }

  if (bodyEditor && document.activeElement !== bodyEditor) {
    bodyEditor.innerHTML = note.content || '<div></div>';
    attachCheckboxHandlers();
  }

  updateWordCount();
}

function attachCheckboxHandlers() {
  const bodyEditor = document.getElementById('note-body-editor');
  if (!bodyEditor) return;

  bodyEditor.querySelectorAll('.apple-checklist-item').forEach(item => {
    const cb = item.querySelector('.apple-checkbox');
    if (cb) {
      cb.onclick = (e) => {
        e.stopPropagation();
        item.classList.toggle('checked');
        cb.textContent = item.classList.contains('checked') ? '✓' : '';
        triggerAutoSave();
      };
    }
  });
}

function updateWordCount() {
  const note = notesState.notes.find(n => n.id === notesState.activeNoteId);
  const charCount = document.getElementById('char-count');
  if (!charCount || !note) return;

  const text = (note.content || '').replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
  const words = text ? text.split(/\s+/).length : 0;
  charCount.textContent = `${words} từ`;
}

let saveTimeout = null;
function triggerAutoSave() {
  const note = notesState.notes.find(n => n.id === notesState.activeNoteId);
  if (!note) return;

  const titleInput = document.getElementById('note-title-input');
  const bodyEditor = document.getElementById('note-body-editor');
  const saveStatus = document.getElementById('save-status');

  if (titleInput) note.title = titleInput.value.trim();
  if (bodyEditor) note.content = bodyEditor.innerHTML;
  note.updatedAt = Date.now();

  const timestampEl = document.getElementById('note-timestamp');
  if (timestampEl) timestampEl.textContent = formatFullTimestamp(note.updatedAt);

  if (saveStatus) {
    saveStatus.textContent = 'Đang lưu...';
  }

  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveNotesToStorage();
    updateFolderCounts();
    renderNotesList();
    updateWordCount();
    if (saveStatus) saveStatus.textContent = 'Đã lưu tự động';
  }, 400);
}

function createNewNote() {
  let targetFolder = notesState.activeFolder;
  if (targetFolder === 'all') targetFolder = 'personal';

  const newNote = {
    id: 'note_' + Date.now(),
    folder: targetFolder,
    title: '',
    content: '<div></div>',
    isPinned: false,
    updatedAt: Date.now()
  };

  notesState.notes.unshift(newNote);
  notesState.activeNoteId = newNote.id;

  saveNotesToStorage();
  renderNotesApp();

  const titleInput = document.getElementById('note-title-input');
  if (titleInput) {
    setTimeout(() => {
      titleInput.focus();
    }, 100);
  }

  const appEl = document.getElementById('apple-notes-app');
  if (appEl) {
    appEl.classList.add('mobile-show-editor');
  }

  showToast('Đã tạo ghi chú mới!');
}

async function deleteActiveNote() {
  const note = notesState.notes.find(n => n.id === notesState.activeNoteId);
  if (!note) return;

  const noteTitle = note.title || 'ghi chú này';
  const confirmed = await showConfirmModal({
    title: 'Xóa ghi chú',
    message: `Bạn có chắc chắn muốn xóa "${noteTitle}" không?`,
    confirmText: 'Xóa ghi chú',
    cancelText: 'Hủy bỏ',
    type: 'danger',
    icon: '🗑️'
  });
  if (!confirmed) return;

  notesState.notes = notesState.notes.filter(n => n.id !== note.id);
  const deletedNotesKey = `aio_deleted_note_ids_${currentUserProfile}`;
  const deletedNoteIds = safeArray(JSON.parse(localStorage.getItem(deletedNotesKey) || '[]'));
  deletedNoteIds.push(note.id);
  localStorage.setItem(deletedNotesKey, JSON.stringify(deletedNoteIds));
  
  if (notesState.notes.length > 0) {
    notesState.activeNoteId = notesState.notes[0].id;
  } else {
    notesState.activeNoteId = null;
  }

  saveNotesToStorage();
  renderNotesApp();
  showToast('Đã xóa ghi chú thành công!');

  const appEl = document.getElementById('apple-notes-app');
  if (appEl && !notesState.activeNoteId) {
    appEl.classList.remove('mobile-show-editor');
  }
}

function togglePinActiveNote() {
  const note = notesState.notes.find(n => n.id === notesState.activeNoteId);
  if (!note) return;

  note.isPinned = !note.isPinned;
  note.updatedAt = Date.now();
  saveNotesToStorage();
  renderNotesApp();
  showToast(note.isPinned ? 'Đã ghim ghi chú lên đầu!' : 'Đã bỏ ghim ghi chú!');
}

function copyNoteContent() {
  const note = notesState.notes.find(n => n.id === notesState.activeNoteId);
  if (!note) return;

  const plainText = (note.content || '')
    .replace(/<div class="apple-checklist-item([^>]*)"><span class="apple-checkbox([^>]*)">(.*?)<\/span><span class="checklist-text">(.*?)<\/span><\/div>/g, '[ ] $4\n')
    .replace(/<[^>]*>?/gm, '\n')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  const fullCopy = `${note.title || 'Ghi chú'}\n\n${plainText}\n\n(Tạo bằng All In One - Apple Notes Pro)`;

  navigator.clipboard.writeText(fullCopy).then(() => {
    showToast('Đã sao chép nội dung ghi chú!');
  }).catch(() => {
    showToast('Sao chép thất bại');
  });
}

function insertChecklistItem() {
  const bodyEditor = document.getElementById('note-body-editor');
  if (!bodyEditor) return;

  const item = document.createElement('div');
  item.className = 'apple-checklist-item';
  item.innerHTML = `<span class="apple-checkbox" contenteditable="false"></span><span class="checklist-text">Việc cần làm...</span>`;
  bodyEditor.appendChild(item);

  attachCheckboxHandlers();
  triggerAutoSave();

  const textSpan = item.querySelector('.checklist-text');
  if (textSpan) {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(textSpan);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function insertBulletItem() {
  const bodyEditor = document.getElementById('note-body-editor');
  if (!bodyEditor) return;

  const bullet = document.createElement('div');
  bullet.innerHTML = `• Ghi chú danh sách...`;
  bodyEditor.appendChild(bullet);
  triggerAutoSave();
}

function insertHeadingItem() {
  const bodyEditor = document.getElementById('note-body-editor');
  if (!bodyEditor) return;

  const h2 = document.createElement('h2');
  h2.className = 'note-subheading';
  h2.textContent = 'Tiêu đề phụ';
  bodyEditor.appendChild(h2);
  triggerAutoSave();
}

function insertBudgetSummaryToNote() {
  const bodyEditor = document.getElementById('note-body-editor');
  if (!bodyEditor) return;

  const totalPercent = getTotalPercent();
  const summaryBox = document.createElement('div');
  summaryBox.className = 'note-budget-embed';
  
  let rowsHtml = '';
  state.categories.forEach(cat => {
    const money = (state.income * cat.percent) / 100;
    rowsHtml += `<div>• ${cat.icon || '📌'} ${escapeHtml(cat.name)} (${cat.percent}%): <strong>${formatMoney(money)}</strong></div>`;
  });

  summaryBox.innerHTML = `
    <div class="embed-title">📊 TỔNG HỢP CHI TIÊU SMARTBUDGET (${formatMoney(state.income)})</div>
    ${rowsHtml}
    <div class="embed-footer">Tổng ngân sách phân bổ: ${totalPercent}%</div>
  `;

  bodyEditor.appendChild(summaryBox);
  triggerAutoSave();
  showToast('Đã chèn bảng chi tiêu SmartBudget vào ghi chú!');
}

function initAppleNotes() {
  loadNotesFromStorage();

  // Folder sidebar click
  document.querySelectorAll('.folder-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.folder-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      notesState.activeFolder = btn.dataset.folder;
      
      const label = document.getElementById('current-folder-label');
      if (label) {
        label.textContent = btn.querySelector('.folder-name').textContent;
      }
      renderNotesList();
    });
  });

  // Search input
  const searchInput = document.getElementById('notes-search-input');
  const btnClearSearch = document.getElementById('btn-clear-notes-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      notesState.searchQuery = e.target.value;
      if (btnClearSearch) {
        btnClearSearch.style.display = notesState.searchQuery ? 'block' : 'none';
      }
      renderNotesList();
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      notesState.searchQuery = '';
      if (searchInput) searchInput.value = '';
      btnClearSearch.style.display = 'none';
      renderNotesList();
    });
  }

  // New Note triggers
  const btnNewNote = document.getElementById('btn-new-note');
  const btnSidebarNewNote = document.getElementById('btn-sidebar-new-note');
  if (btnNewNote) btnNewNote.addEventListener('click', createNewNote);
  if (btnSidebarNewNote) btnSidebarNewNote.addEventListener('click', createNewNote);

  // Editor Actions
  const btnDelete = document.getElementById('btn-delete-note');
  const btnPin = document.getElementById('btn-toggle-pin');
  const btnCopy = document.getElementById('btn-copy-note');
  const btnAddChecklist = document.getElementById('btn-add-checklist');
  if (btnDelete) btnDelete.addEventListener('click', deleteActiveNote);
  if (btnPin) btnPin.addEventListener('click', togglePinActiveNote);
  if (btnCopy) btnCopy.addEventListener('click', copyNoteContent);
  if (btnAddChecklist) btnAddChecklist.addEventListener('click', insertChecklistItem);

  // Mobile back button
  const btnBack = document.getElementById('btn-notes-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      const appEl = document.getElementById('apple-notes-app');
      if (appEl) {
        appEl.classList.remove('mobile-show-editor');
      }
    });
  }

  // Folder select inside note editor
  const folderSelect = document.getElementById('note-folder-select');
  if (folderSelect) {
    folderSelect.addEventListener('change', (e) => {
      const note = notesState.notes.find(n => n.id === notesState.activeNoteId);
      if (note) {
        note.folder = e.target.value;
        saveNotesToStorage();
        updateFolderCounts();
        renderNotesList();
        showToast('Đã đổi danh mục dự án cho ghi chú!');
      }
    });
  }

  // Format chips
  const chipCheck = document.getElementById('chip-insert-check');
  const chipBullet = document.getElementById('chip-insert-bullet');
  const chipH2 = document.getElementById('chip-insert-h2');
  const chipBudget = document.getElementById('chip-insert-budget');
  if (chipCheck) chipCheck.addEventListener('click', insertChecklistItem);
  if (chipBullet) chipBullet.addEventListener('click', insertBulletItem);
  if (chipH2) chipH2.addEventListener('click', insertHeadingItem);
  if (chipBudget) chipBudget.addEventListener('click', insertBudgetSummaryToNote);

  // Auto-save on title and body input
  const titleInput = document.getElementById('note-title-input');
  const bodyEditor = document.getElementById('note-body-editor');
  if (titleInput) {
    titleInput.addEventListener('input', triggerAutoSave);
  }
  if (bodyEditor) {
    bodyEditor.addEventListener('input', triggerAutoSave);
    bodyEditor.addEventListener('blur', triggerAutoSave);
  }

  renderNotesApp();
}

// =============================================================================
// MODULE 4: SỔ THU CHI KOMOREBI (KAKEIBO) - STATE & ENGINE
// =============================================================================

const LEDGER_STORAGE_KEY = 'aio_komorebi_ledger_data';
const LEDGER_BUDGET_KEY = 'aio_komorebi_budget_limits';

const KOMO_CATEGORIES = {
  expense: [
    { id: 'food', name: 'Ăn uống', icon: '🍽️', color: '#f97316' },
    { id: 'daily', name: 'Chi tiêu hằng ngày', icon: '🧴', color: '#10b981' },
    { id: 'clothes', name: 'Quần áo', icon: '👕', color: '#3b82f6' },
    { id: 'cosmetics', name: 'Mỹ phẩm', icon: '💄', color: '#ec4899' },
    { id: 'social', name: 'Phí giao lưu', icon: '🥂', color: '#eab308' },
    { id: 'medical', name: 'Y tế', icon: '💊', color: '#14b8a6' },
    { id: 'education', name: 'Giáo dục', icon: '📚', color: '#8b5cf6' },
    { id: 'utilities', name: 'Tiền điện/nước', icon: '🚰', color: '#06b6d4' },
    { id: 'transport', name: 'Đi lại', icon: '🚆', color: '#6366f1' },
    { id: 'telecom', name: 'Phí liên lạc', icon: '📱', color: '#64748b' },
    { id: 'house', name: 'Tiền nhà', icon: '🏠', color: '#f59e0b' },
    { id: 'other', name: 'Khác', icon: '✨', color: '#a855f7' }
  ],
  income: [
    { id: 'salary', name: 'Tiền lương', icon: '💰', color: '#10b981' },
    { id: 'bonus', name: 'Thưởng', icon: '🎁', color: '#f59e0b' },
    { id: 'invest', name: 'Đầu tư / Lãi', icon: '📈', color: '#6366f1' },
    { id: 'side_job', name: 'Nghề phụ', icon: '💼', color: '#3b82f6' },
    { id: 'other_inc', name: 'Thu khác', icon: '💵', color: '#06b6d4' }
  ]
};

const ledgerState = {
  activeSubTab: 'calendar',
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  selectedDateStr: formatYMD(new Date()),
  entryType: 'expense',
  entryCategory: 'food',
  reportPeriod: 'monthly',
  reportTab: 'expense',
  transactions: [],
  budgetLimits: {
    food: 1800000,
    daily: 1200000,
    clothes: 800000,
    cosmetics: 300000,
    social: 800000,
    utilities: 600000,
    house: 4000000,
    transport: 500000
  }
};

function formatYMD(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseYMD(ymdStr) {
  const [y, m, d] = ymdStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getDayOfWeekName(d) {
  const days = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return days[d.getDay()];
}

function loadLedgerFromStorage() {
  try {
    const txKey = getUserStorageKey(LEDGER_STORAGE_KEY);
    const bgKey = getUserStorageKey(LEDGER_BUDGET_KEY);
    let raw = localStorage.getItem(txKey);
    if (!raw && currentUserProfile === 'anh') {
      raw = localStorage.getItem(LEDGER_STORAGE_KEY);
      if (raw) localStorage.setItem(txKey, raw);
    }

    if (raw) {
      const data = JSON.parse(raw);
      ledgerState.transactions = safeArray(data);
    } else {
      ledgerState.transactions = [];
    }

    let rawBudgets = localStorage.getItem(bgKey);
    if (!rawBudgets && currentUserProfile === 'anh') {
      rawBudgets = localStorage.getItem(LEDGER_BUDGET_KEY);
      if (rawBudgets) localStorage.setItem(bgKey, rawBudgets);
    }
    if (rawBudgets) {
      ledgerState.budgetLimits = Object.assign(ledgerState.budgetLimits, JSON.parse(rawBudgets));
    }
  } catch (e) {
    console.warn('Ledger load failed:', e);
  }
}

function saveLedgerToStorage() {
  try {
    const txKey = getUserStorageKey(LEDGER_STORAGE_KEY);
    const bgKey = getUserStorageKey(LEDGER_BUDGET_KEY);
    localStorage.setItem(txKey, JSON.stringify(safeArray(ledgerState.transactions)));
    localStorage.setItem(bgKey, JSON.stringify(ledgerState.budgetLimits || {}));
    markProfileLocallyUpdated(currentUserProfile);
    if (typeof triggerCloudSyncDebounced === 'function') {
      triggerCloudSyncDebounced(150, currentUserProfile);
    }
  } catch (e) {
    console.warn('Ledger save failed:', e);
  }
}

function renderLedgerApp() {
  switchLedgerSubTab(ledgerState.activeSubTab);
}

function switchLedgerSubTab(tabName) {
  ledgerState.activeSubTab = tabName;

  document.querySelectorAll('.komo-nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.subtab === tabName);
  });

  const views = ['calendar', 'input', 'report', 'budget', 'reminder'];
  views.forEach(v => {
    const el = document.getElementById(`komo-view-${v}`);
    if (el) {
      el.style.display = v === tabName ? 'block' : 'none';
      if (v === tabName) el.classList.add('active');
      else el.classList.remove('active');
    }
  });

  if (tabName === 'calendar') {
    renderLedgerCalendar();
  } else if (tabName === 'input') {
    renderEntryForm();
  } else if (tabName === 'report') {
    renderLedgerReports();
  } else if (tabName === 'budget') {
    renderLedgerBudget();
  } else if (tabName === 'reminder') {
    if (typeof updateReminderUIState === 'function' && updateReminderUIState) {
      updateReminderUIState();
    }
  }
}

// 1. CALENDAR VIEW LOGIC
function renderLedgerCalendar() {
  const monthLabel = document.getElementById('calendar-month-label');
  const rangeLabel = document.getElementById('calendar-range-label');
  const daysGrid = document.getElementById('calendar-days-grid');
  if (!daysGrid) return;

  const y = ledgerState.currentYear;
  const m = ledgerState.currentMonth;

  const firstDay = new Date(y, m, 1);
  const lastDay = new Date(y, m + 1, 0);
  const totalDays = lastDay.getDate();
  // Thứ 2 là cột 0 (T2), Chủ Nhật là cột 6 (CN) cạnh Thứ 7
  const startOffset = (firstDay.getDay() + 6) % 7;

  if (monthLabel) {
    monthLabel.textContent = `${String(m + 1).padStart(2, '0')}/${y}`;
  }
  if (rangeLabel) {
    rangeLabel.textContent = `(01/${String(m + 1).padStart(2, '0')} – ${totalDays}/${String(m + 1).padStart(2, '0')})`;
  }

  daysGrid.innerHTML = '';

  const prevLastDay = new Date(y, m, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const dayNum = prevLastDay - i;
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell other-month';
    cell.innerHTML = `<span class="day-num">${dayNum}</span>`;
    daysGrid.appendChild(cell);
  }

  let monthlyIncome = 0;
  let monthlyExpense = 0;
  const todayStr = formatYMD(new Date());

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayOfWeek = new Date(y, m, d).getDay();

    const dayTx = ledgerState.transactions.filter(t => t.date === dateStr);
    let dayInc = 0;
    let dayExp = 0;
    dayTx.forEach(t => {
      if (t.type === 'income') dayInc += t.amount;
      else dayExp += t.amount;
    });

    monthlyIncome += dayInc;
    monthlyExpense += dayExp;

    const cell = document.createElement('div');
    cell.className = 'cal-day-cell current-month';
    if (dayOfWeek === 0) cell.classList.add('cn-col');
    if (dayOfWeek === 6) cell.classList.add('t7-col');
    if (dateStr === todayStr) cell.classList.add('is-today');
    if (dateStr === ledgerState.selectedDateStr) cell.classList.add('is-selected');

    cell.dataset.date = dateStr;

    let badgeHtml = '';
    if (dayInc > 0) {
      badgeHtml += `<span class="day-badge badge-inc">+${formatCompactAmount(dayInc)}</span>`;
    }
    if (dayExp > 0) {
      badgeHtml += `<span class="day-badge badge-exp">-${formatCompactAmount(dayExp)}</span>`;
    }

    cell.innerHTML = `
      <span class="day-num">${d}</span>
      <div class="day-amounts">${badgeHtml}</div>
    `;

    cell.addEventListener('click', () => {
      ledgerState.selectedDateStr = dateStr;
      document.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('is-selected'));
      cell.classList.add('is-selected');
      renderSelectedDayTransactions();
    });

    daysGrid.appendChild(cell);
  }

  const remainingCells = 42 - (startOffset + totalDays);
  const endPadding = remainingCells >= 7 ? remainingCells - 7 : remainingCells;
  for (let nextD = 1; nextD <= endPadding; nextD++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day-cell other-month';
    cell.innerHTML = `<span class="day-num">${nextD}</span>`;
    daysGrid.appendChild(cell);
  }

  const incEl = document.getElementById('cal-month-income');
  const expEl = document.getElementById('cal-month-expense');
  const balEl = document.getElementById('cal-month-balance');
  const balance = monthlyIncome - monthlyExpense;

  if (incEl) incEl.textContent = formatMoney(monthlyIncome);
  if (expEl) expEl.textContent = formatMoney(monthlyExpense);
  if (balEl) {
    balEl.textContent = (balance >= 0 ? '+' : '') + formatMoney(balance);
    balEl.className = 'summary-val font-bold ' + (balance >= 0 ? 'text-emerald' : 'text-rose');
  }

  renderSelectedDayTransactions();
}

function formatCompactAmount(amount) {
  if (amount >= 1000000) {
    const tr = Math.round((amount / 1000000) * 10) / 10;
    return tr + 'Tr';
  }
  if (amount >= 1000) {
    return Math.round(amount / 1000) + 'k';
  }
  return amount;
}

function renderSelectedDayTransactions() {
  const container = document.getElementById('day-transactions-container');
  const headingEl = document.getElementById('selected-day-heading');
  const netEl = document.getElementById('selected-day-net');
  if (!container) return;

  const dateObj = parseYMD(ledgerState.selectedDateStr);
  const dayName = getDayOfWeekName(dateObj);
  const day = dateObj.getDate();
  const month = dateObj.getMonth() + 1;
  const year = dateObj.getFullYear();

  if (headingEl) {
    headingEl.textContent = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year} (${dayName})`;
  }

  const txList = ledgerState.transactions.filter(t => t.date === ledgerState.selectedDateStr);
  container.innerHTML = '';

  let dayIncome = 0;
  let dayExpense = 0;

  if (txList.length === 0) {
    container.innerHTML = `
      <div class="day-empty-row">
        <span>Không có khoản chi hoặc thu nào trong ngày này.</span>
      </div>
    `;
    if (netEl) {
      netEl.textContent = '0 ₫';
      netEl.className = 'day-net-amount';
    }
    return;
  }

  txList.forEach(t => {
    if (t.type === 'income') dayIncome += t.amount;
    else dayExpense += t.amount;

    const catList = t.type === 'income' ? KOMO_CATEGORIES.income : KOMO_CATEGORIES.expense;
    const cat = catList.find(c => c.id === t.category) || { name: 'Khác', icon: '✨', color: '#64748b' };

    const row = document.createElement('div');
    row.className = 'komo-tx-item';
    row.innerHTML = `
      <div class="tx-left">
        <div class="tx-icon-badge" style="background: ${cat.color}20; color: ${cat.color};">${cat.icon}</div>
        <div class="tx-info">
          <span class="tx-cat-name">${escapeHtml(cat.name)}</span>
          <span class="tx-note">${escapeHtml(t.note || '')}</span>
        </div>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${t.type === 'income' ? 'text-blue' : 'text-orange'}">
          ${t.type === 'income' ? '+' : '-'}${formatMoney(t.amount)}
        </span>
        <button class="btn-delete-tx" data-id="${t.id}" title="Xóa giao dịch này">✕</button>
      </div>
    `;

    row.querySelector('.btn-delete-tx').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTransaction(t.id);
    });

    container.appendChild(row);
  });

  const netDay = dayIncome - dayExpense;
  if (netEl) {
    netEl.textContent = (netDay >= 0 ? '+' : '') + formatMoney(netDay);
    netEl.className = 'day-net-amount ' + (netDay >= 0 ? 'text-emerald' : 'text-orange');
  }
}

async function deleteTransaction(id) {
  const confirmed = await showConfirmModal({
    title: 'Xóa giao dịch',
    message: 'Bạn có chắc chắn muốn xóa khoản thu/chi này không?',
    confirmText: 'Xóa giao dịch',
    cancelText: 'Hủy bỏ',
    type: 'danger',
    icon: '🗑️'
  });
  if (!confirmed) return;

  ledgerState.transactions = ledgerState.transactions.filter(t => t.id !== id);
  const deletedKey = `aio_deleted_tx_ids_${currentUserProfile}`;
  const deletedIds = safeArray(JSON.parse(localStorage.getItem(deletedKey) || '[]'));
  deletedIds.push(id);
  localStorage.setItem(deletedKey, JSON.stringify(deletedIds));
  saveLedgerToStorage();
  renderLedgerCalendar();
  showToast('Đã xóa giao dịch thành công!');
}

// 2. QUICK ENTRY VIEW LOGIC
function renderEntryForm() {
  const catGrid = document.getElementById('komo-cat-grid');
  const typeButtons = document.querySelectorAll('.type-btn');
  const amountLabel = document.getElementById('entry-amount-label');
  const submitBtn = document.getElementById('btn-submit-transaction');
  const dateInput = document.getElementById('entry-date-input');
  const amountInput = document.getElementById('entry-amount-input');

  if (dateInput) dateInput.value = ledgerState.selectedDateStr;
  updateEntryDateDisplay();

  typeButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.entryType === ledgerState.entryType);
  });

  if (amountLabel) {
    amountLabel.textContent = ledgerState.entryType === 'income' ? 'Tiền thu' : 'Tiền chi';
  }
  if (submitBtn) {
    submitBtn.textContent = ledgerState.entryType === 'income' ? 'Nhập khoản thu' : 'Nhập khoản chi';
    submitBtn.className = 'btn-komo-submit ' + (ledgerState.entryType === 'income' ? 'income-mode' : 'expense-mode');
  }

  if (catGrid) {
    catGrid.innerHTML = '';
    const list = ledgerState.entryType === 'income' ? KOMO_CATEGORIES.income : KOMO_CATEGORIES.expense;
    
    if (!list.find(c => c.id === ledgerState.selectedCategory)) {
      ledgerState.selectedCategory = list[0].id;
    }

    list.forEach(c => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'komo-cat-btn' + (c.id === ledgerState.selectedCategory ? ' active' : '');
      btn.dataset.id = c.id;
      btn.style.setProperty('--cat-theme-color', c.color);
      btn.innerHTML = `
        <span class="cat-icon">${c.icon}</span>
        <span class="cat-label">${escapeHtml(c.name)}</span>
      `;

      btn.addEventListener('click', () => {
        ledgerState.selectedCategory = c.id;
        document.querySelectorAll('.komo-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });

      catGrid.appendChild(btn);
    });
  }

  if (amountInput) {
    setTimeout(() => amountInput.focus(), 150);
  }
}

function updateEntryDateDisplay() {
  const display = document.getElementById('entry-date-display');
  if (!display) return;
  const d = parseYMD(ledgerState.selectedDateStr);
  const dayName = getDayOfWeekName(d);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  display.textContent = `${day}/${month}/${year} (${dayName})`;
}

async function submitNewTransaction() {
  const amountInput = document.getElementById('entry-amount-input');
  const noteInput = document.getElementById('entry-note-input');
  const amount = parseMoneyInput(amountInput ? amountInput.value : '0');
  const note = noteInput ? noteInput.value.trim() : '';

  if (amount <= 0) {
    await showAlertModal({
      title: 'Số tiền chưa hợp lệ',
      message: 'Vui lòng nhập số tiền lớn hơn 0 trước khi lưu khoản chi/thu!',
      buttonText: 'Đã hiểu',
      icon: '⚠️'
    });
    if (amountInput) amountInput.focus();
    return;
  }

  const newTx = {
    id: 'tx_' + Date.now(),
    type: ledgerState.entryType,
    amount: amount,
    category: ledgerState.selectedCategory,
    note: note,
    date: ledgerState.selectedDateStr
  };

  ledgerState.transactions.push(newTx);
  saveLedgerToStorage();

  if (amountInput) {
    amountInput.value = '';
    amountInput.focus();
  }
  if (noteInput) noteInput.value = '';

  showToast(`Đã thêm ${ledgerState.entryType === 'income' ? 'khoản thu' : 'khoản chi'} ${formatMoney(amount)} thành công!`);
  // Giữ nguyên giao diện 'Nhập vào' để người dùng tiếp tục nhập nhanh các khoản tiếp theo
}

// 3. REPORTS VIEW LOGIC
function renderLedgerReports() {
  const periodLabel = document.getElementById('report-period-label');
  const totalExpEl = document.getElementById('report-total-expense');
  const totalIncEl = document.getElementById('report-total-income');
  const totalBalEl = document.getElementById('report-total-balance');
  const donutSvg = document.getElementById('komo-report-donut');
  const donutCenter = document.getElementById('donut-center-amount');
  const donutTypeLabel = document.getElementById('donut-type-label');
  const rankingList = document.getElementById('report-ranking-container');
  const rankingTitle = document.getElementById('ranking-title');

  const y = ledgerState.currentYear;
  const m = ledgerState.currentMonth;

  if (periodLabel) {
    if (ledgerState.reportPeriod === 'monthly') {
      periodLabel.textContent = `${String(m + 1).padStart(2, '0')}/${y}`;
    } else {
      periodLabel.textContent = `Năm ${y}`;
    }
  }

  let filteredTx = ledgerState.transactions.filter(t => {
    const txDate = parseYMD(t.date);
    if (ledgerState.reportPeriod === 'monthly') {
      return txDate.getFullYear() === y && txDate.getMonth() === m;
    } else {
      return txDate.getFullYear() === y;
    }
  });

  let totalExpense = 0;
  let totalIncome = 0;
  filteredTx.forEach(t => {
    if (t.type === 'income') totalIncome += t.amount;
    else totalExpense += t.amount;
  });

  const netBalance = totalIncome - totalExpense;

  if (totalExpEl) totalExpEl.textContent = '-' + formatMoney(totalExpense);
  if (totalIncEl) totalIncEl.textContent = '+' + formatMoney(totalIncome);
  if (totalBalEl) {
    totalBalEl.textContent = (netBalance >= 0 ? '+' : '') + formatMoney(netBalance);
    totalBalEl.className = 's-val font-bold ' + (netBalance >= 0 ? 'text-emerald' : 'text-orange');
  }

  const isExp = ledgerState.reportTab === 'expense';
  const targetTx = filteredTx.filter(t => t.type === ledgerState.reportTab);
  const targetTotal = isExp ? totalExpense : totalIncome;

  if (donutTypeLabel) donutTypeLabel.textContent = isExp ? 'Tổng chi' : 'Tổng thu';
  if (donutCenter) donutCenter.textContent = formatMoney(targetTotal);
  if (rankingTitle) rankingTitle.textContent = isExp ? 'Xếp hạng các khoản chi' : 'Xếp hạng nguồn thu nhập';

  const catMap = {};
  targetTx.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  });

  const categoriesDef = isExp ? KOMO_CATEGORIES.expense : KOMO_CATEGORIES.income;
  const ranking = Object.keys(catMap).map(catId => {
    const def = categoriesDef.find(c => c.id === catId) || { name: 'Khác', icon: '✨', color: '#64748b' };
    const amount = catMap[catId];
    const pct = targetTotal > 0 ? Math.round((amount / targetTotal) * 1000) / 10 : 0;
    return { id: catId, name: def.name, icon: def.icon, color: def.color, amount, pct };
  });

  ranking.sort((a, b) => b.amount - a.amount);

  if (donutSvg) {
    donutSvg.innerHTML = '';
    const radius = 75;
    const circumference = 2 * Math.PI * radius;
    let accumulated = 0;

    const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    bgCircle.setAttribute('cx', '110');
    bgCircle.setAttribute('cy', '110');
    bgCircle.setAttribute('r', radius.toString());
    bgCircle.setAttribute('fill', 'none');
    bgCircle.setAttribute('class', 'donut-segment-track');
    bgCircle.setAttribute('stroke', (document.documentElement.getAttribute('data-theme') === 'dark') ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)');
    bgCircle.setAttribute('stroke-width', '24');
    donutSvg.appendChild(bgCircle);

    if (targetTotal > 0) {
      ranking.forEach(r => {
        const strokeLength = (r.pct / 100) * circumference;
        const strokeOffset = -((accumulated / 100) * circumference);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '110');
        circle.setAttribute('cy', '110');
        circle.setAttribute('r', radius.toString());
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke', r.color);
        circle.setAttribute('stroke-width', '24');
        circle.setAttribute('stroke-dasharray', `${strokeLength} ${circumference}`);
        circle.setAttribute('stroke-dashoffset', strokeOffset.toString());

        const titleTag = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleTag.textContent = `${r.name}: ${formatMoney(r.amount)} (${r.pct}%)`;
        circle.appendChild(titleTag);

        donutSvg.appendChild(circle);
        accumulated += r.pct;
      });
    }
  }

  if (rankingList) {
    rankingList.innerHTML = '';
    if (ranking.length === 0) {
      rankingList.innerHTML = `<div class="empty-report-row">Chưa có giao dịch trong kỳ này</div>`;
      return;
    }

    ranking.forEach(r => {
      const row = document.createElement('div');
      row.className = 'komo-ranking-item';
      row.innerHTML = `
        <div class="rk-top">
          <div class="rk-cat-left">
            <span class="rk-icon" style="background: ${r.color}20; color: ${r.color};">${r.icon}</span>
            <span class="rk-name">${escapeHtml(r.name)}</span>
          </div>
          <div class="rk-cat-right">
            <span class="rk-amount">${formatMoney(r.amount)}</span>
            <span class="rk-pct">${r.pct}%</span>
          </div>
        </div>
        <div class="rk-bar-wrap">
          <div class="rk-bar-fill" style="width: ${r.pct}%; background-color: ${r.color};"></div>
        </div>
      `;
      rankingList.appendChild(row);
    });
  }
}

// 4. BUDGET LIMITS LOGIC
function renderLedgerBudget() {
  const container = document.getElementById('category-budgets-container');
  const tbLimit = document.getElementById('tb-limit-val');
  const tbSpent = document.getElementById('tb-spent-val');
  const tbRemaining = document.getElementById('tb-remaining-val');
  const tbBar = document.getElementById('tb-progress-bar');
  const tbPct = document.getElementById('tb-pct-text');
  const tbTip = document.getElementById('tb-status-tip');

  if (!container) return;

  const y = ledgerState.currentYear;
  const m = ledgerState.currentMonth;

  const monthTx = ledgerState.transactions.filter(t => {
    const d = parseYMD(t.date);
    return t.type === 'expense' && d.getFullYear() === y && d.getMonth() === m;
  });

  const spentMap = {};
  let totalSpent = 0;
  monthTx.forEach(t => {
    spentMap[t.category] = (spentMap[t.category] || 0) + t.amount;
    totalSpent += t.amount;
  });

  let totalLimit = 0;
  Object.values(ledgerState.budgetLimits).forEach(v => totalLimit += v);

  const totalRemaining = totalLimit - totalSpent;
  const totalPct = totalLimit > 0 ? Math.min(100, Math.round((totalSpent / totalLimit) * 100)) : 0;

  if (tbLimit) tbLimit.textContent = formatMoney(totalLimit);
  if (tbSpent) tbSpent.textContent = formatMoney(totalSpent);
  if (tbRemaining) {
    tbRemaining.textContent = formatMoney(Math.abs(totalRemaining));
    tbRemaining.className = 'tb-remaining-amount ' + (totalRemaining >= 0 ? 'text-emerald' : 'text-rose');
  }

  if (tbBar) {
    tbBar.style.width = `${totalPct}%`;
    tbBar.className = 'tb-progress-bar ' + (totalPct >= 100 ? 'bg-danger' : (totalPct >= 80 ? 'bg-warning' : 'bg-primary'));
  }
  if (tbPct) tbPct.textContent = `Đã dùng ${totalPct}%`;
  if (tbTip) {
    if (totalRemaining >= 0) {
      tbTip.textContent = 'An toàn trong hạn mức';
      tbTip.className = 'text-emerald';
    } else {
      tbTip.textContent = 'Đã vượt hạn mức ngân sách!';
      tbTip.className = 'text-rose font-bold';
    }
  }

  container.innerHTML = '';

  KOMO_CATEGORIES.expense.forEach(cat => {
    const limit = ledgerState.budgetLimits[cat.id] || 0;
    if (limit <= 0) return;

    const spent = spentMap[cat.id] || 0;
    const remaining = limit - spent;
    const pct = Math.min(100, Math.round((spent / limit) * 100));

    const card = document.createElement('div');
    card.className = 'budget-cat-card';
    card.innerHTML = `
      <div class="bc-top">
        <div class="bc-left">
          <span class="bc-icon">${cat.icon}</span>
          <span class="bc-name">${escapeHtml(cat.name)}</span>
        </div>
        <div class="bc-right">
          <span class="bc-remaining-label">${remaining >= 0 ? 'Còn lại:' : 'Vượt mức:'}</span>
          <span class="bc-remaining-val ${remaining >= 0 ? 'text-emerald' : 'text-rose'}">${formatMoney(Math.abs(remaining))}</span>
          <span class="bc-pct-tag">${pct}%</span>
        </div>
      </div>

      <div class="bc-progress-wrap">
        <div class="bc-progress-bar" style="width: ${pct}%; background-color: ${pct >= 100 ? '#ef4444' : (pct >= 80 ? '#f59e0b' : cat.color)};"></div>
      </div>

      <div class="bc-bottom-sub">
        <span>Ngân sách: ${formatMoney(limit)}</span>
        <span class="text-muted">Đã chi: ${formatMoney(spent)}</span>
      </div>
    `;

    container.appendChild(card);
  });
}

function syncBudgetFromSmartBudget() {
  let syncedCount = 0;
  state.categories.forEach(cat => {
    const money = Math.round((state.income * cat.percent) / 100);
    const lower = cat.name.toLowerCase();

    if (/ăn|uống|food/i.test(lower)) {
      ledgerState.budgetLimits.food = money;
      syncedCount++;
    } else if (/nhà|trọ|thuê/i.test(lower)) {
      ledgerState.budgetLimits.house = money;
      syncedCount++;
    } else if (/hàng ngày|tạp hóa|sinh hoạt/i.test(lower)) {
      ledgerState.budgetLimits.daily = money;
      syncedCount++;
    } else if (/giao lưu|cafe|vui chơi|play/i.test(lower)) {
      ledgerState.budgetLimits.social = money;
      syncedCount++;
    } else if (/quần áo|mua sắm/i.test(lower)) {
      ledgerState.budgetLimits.clothes = money;
      syncedCount++;
    } else if (/điện|nước|hóa đơn/i.test(lower)) {
      ledgerState.budgetLimits.utilities = money;
      syncedCount++;
    }
  });

  saveLedgerToStorage();
  renderLedgerBudget();
  showToast(`Đã đồng bộ ${syncedCount} hạn mức từ SmartBudget!`);
}

function initKomorebiLedger() {
  loadLedgerFromStorage();

  document.querySelectorAll('.komo-nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      switchLedgerSubTab(btn.dataset.subtab);
    });
  });

  const btnPrevMonth = document.getElementById('btn-prev-month');
  const btnNextMonth = document.getElementById('btn-next-month');
  const btnTodayMonth = document.getElementById('btn-today-month');

  if (btnPrevMonth) {
    btnPrevMonth.addEventListener('click', () => {
      ledgerState.currentMonth--;
      if (ledgerState.currentMonth < 0) {
        ledgerState.currentMonth = 11;
        ledgerState.currentYear--;
      }
      renderLedgerCalendar();
    });
  }

  if (btnNextMonth) {
    btnNextMonth.addEventListener('click', () => {
      ledgerState.currentMonth++;
      if (ledgerState.currentMonth > 11) {
        ledgerState.currentMonth = 0;
        ledgerState.currentYear++;
      }
      renderLedgerCalendar();
    });
  }

  if (btnTodayMonth) {
    btnTodayMonth.addEventListener('click', () => {
      const now = new Date();
      ledgerState.currentMonth = now.getMonth();
      ledgerState.currentYear = now.getFullYear();
      ledgerState.selectedDateStr = formatYMD(now);
      renderLedgerCalendar();
    });
  }

  const btnQuickAddForDay = document.getElementById('btn-quick-add-for-day');
  if (btnQuickAddForDay) {
    btnQuickAddForDay.addEventListener('click', () => {
      switchLedgerSubTab('input');
    });
  }

  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ledgerState.entryType = btn.dataset.entryType;
      renderEntryForm();
    });
  });

  const btnEntryPrevDay = document.getElementById('btn-entry-prev-day');
  const btnEntryNextDay = document.getElementById('btn-entry-next-day');
  const entryDateInput = document.getElementById('entry-date-input');

  if (btnEntryPrevDay) {
    btnEntryPrevDay.addEventListener('click', () => {
      const d = parseYMD(ledgerState.selectedDateStr);
      d.setDate(d.getDate() - 1);
      ledgerState.selectedDateStr = formatYMD(d);
      if (entryDateInput) entryDateInput.value = ledgerState.selectedDateStr;
      updateEntryDateDisplay();
    });
  }

  if (btnEntryNextDay) {
    btnEntryNextDay.addEventListener('click', () => {
      const d = parseYMD(ledgerState.selectedDateStr);
      d.setDate(d.getDate() + 1);
      ledgerState.selectedDateStr = formatYMD(d);
      if (entryDateInput) entryDateInput.value = ledgerState.selectedDateStr;
      updateEntryDateDisplay();
    });
  }

  if (entryDateInput) {
    entryDateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        ledgerState.selectedDateStr = e.target.value;
        updateEntryDateDisplay();
      }
    });
  }

  const entryAmountInput = document.getElementById('entry-amount-input');
  if (entryAmountInput) {
    entryAmountInput.addEventListener('input', (e) => {
      const raw = e.target.value.replace(/\D/g, '');
      const num = parseInt(raw, 10) || 0;
      e.target.value = num === 0 ? '' : formatNumberForInput(num, suiteState.currency);
    });
  }

  const btnClearEntryAmount = document.getElementById('btn-clear-entry-amount');
  if (btnClearEntryAmount) {
    btnClearEntryAmount.addEventListener('click', () => {
      if (entryAmountInput) {
        entryAmountInput.value = '';
        entryAmountInput.focus();
      }
    });
  }

  const entryNoteInput = document.getElementById('entry-note-input');
  if (entryNoteInput) {
    entryNoteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitNewTransaction();
      }
    });
  }

  const btnSubmitTx = document.getElementById('btn-submit-transaction');
  if (btnSubmitTx) {
    btnSubmitTx.addEventListener('click', submitNewTransaction);
  }

  document.querySelectorAll('.period-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ledgerState.reportPeriod = btn.dataset.reportPeriod;
      renderLedgerReports();
    });
  });

  document.querySelectorAll('.rpt-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rpt-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ledgerState.reportTab = btn.dataset.reportTab;
      renderLedgerReports();
    });
  });

  const btnReportPrev = document.getElementById('btn-report-prev');
  const btnReportNext = document.getElementById('btn-report-next');
  if (btnReportPrev) {
    btnReportPrev.addEventListener('click', () => {
      if (ledgerState.reportPeriod === 'monthly') {
        ledgerState.currentMonth--;
        if (ledgerState.currentMonth < 0) {
          ledgerState.currentMonth = 11;
          ledgerState.currentYear--;
        }
      } else {
        ledgerState.currentYear--;
      }
      renderLedgerReports();
    });
  }

  if (btnReportNext) {
    btnReportNext.addEventListener('click', () => {
      if (ledgerState.reportPeriod === 'monthly') {
        ledgerState.currentMonth++;
        if (ledgerState.currentMonth > 11) {
          ledgerState.currentMonth = 0;
          ledgerState.currentYear++;
        }
      } else {
        ledgerState.currentYear++;
      }
      renderLedgerReports();
    });
  }

  const btnSyncLimits = document.getElementById('btn-sync-budget-limits');
  if (btnSyncLimits) {
    btnSyncLimits.addEventListener('click', syncBudgetFromSmartBudget);
  }
}

// ==========================================================================
// Theme Manager (Light / Dark Mode)
// ==========================================================================
const AIO_STORAGE_KEY_THEME = 'aio_suite_theme_mode';

function initThemeManager() {
  const savedTheme = localStorage.getItem(AIO_STORAGE_KEY_THEME) || 'light';
  applyTheme(savedTheme);

  const toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
      localStorage.setItem(AIO_STORAGE_KEY_THEME, newTheme);
      showToast(newTheme === 'light' ? 'Đã bật giao diện Sáng hài hòa' : 'Đã bật giao diện Tối');
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const iconEl = document.getElementById('theme-toggle-icon');
  const textEl = document.getElementById('theme-toggle-text');
  if (theme === 'dark') {
    if (iconEl) iconEl.textContent = '☀️';
    if (textEl) textEl.textContent = 'Sáng';
  } else {
    if (iconEl) iconEl.textContent = '🌙';
    if (textEl) textEl.textContent = 'Tối';
  }
  // Re-render chart if rendered
  if (typeof renderDonutChart === 'function' && typeof state !== 'undefined') {
    renderDonutChart(state.categories.reduce((acc, c) => acc + c.percent, 0));
  }
  if (typeof renderLedgerReports === 'function') {
    renderLedgerReports();
  }
}

// =============================================================================
// MODULE 5: PWA WEB PUSH REMINDER FEATURE (FOR IPHONE & MOBILE)
// =============================================================================

const VAPID_PUBLIC_KEY = 'BFX-a3bf7VVGRGGR1WkmTQKQH93aoWVH56dNTwU6gzdSEApbd_RerTka_n9m0fJLE6CZsYbphUOv80VllkZuo1s';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Register service worker immediately
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

let updateReminderUIState = null;

function initReminderFeature() {
  const reminderView = document.getElementById('komo-view-reminder');
  const btnOpenHeader = document.getElementById('btn-quick-reminder-header');
  const btnSave = document.getElementById('btn-save-reminder');
  const btnTestPush = document.getElementById('btn-test-push');
  const timeInput = document.getElementById('reminder-time-input');
  const statusBadge = document.getElementById('reminder-status-badge');
  const profileLabel = document.getElementById('reminder-profile-label');
  const profileIcon = document.getElementById('reminder-profile-icon');
  const iosTip = document.getElementById('reminder-ios-tip');
  const previewText = document.getElementById('reminder-preview-text');
  const presetBtns = document.querySelectorAll('.reminder-preset-btn');

  if (!reminderView) return;

  // Load saved reminder time from localStorage
  const savedTime = localStorage.getItem('aio_reminder_time') || '21:00';
  if (timeInput) timeInput.value = savedTime;

  function updatePresetButtons(timeVal) {
    presetBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.time === timeVal);
    });
  }
  updatePresetButtons(savedTime);

  function updatePreview() {
    if (!previewText) return;
    const timeVal = (timeInput && timeInput.value) || '21:00';
    const profileName = currentUserProfile === 'em' ? 'Em' : 'Anh';
    previewText.textContent = `Đã ${timeVal} rồi! ${profileName} ơi, hôm nay mình đã ghi chép các khoản chi tiêu đầy đủ chưa?`;
  }

  updateReminderUIState = function() {
    const profileName = currentUserProfile === 'em' ? 'Em' : 'Anh';
    if (profileLabel) profileLabel.textContent = profileName;
    if (profileIcon) profileIcon.textContent = currentUserProfile === 'em' ? '👩' : '👨';

    updatePreview();

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

    if (iosTip) {
      if (isIOS && !isStandalone) {
        iosTip.style.display = 'block';
      } else {
        iosTip.style.display = 'none';
      }
    }

    if (!('Notification' in window)) {
      if (statusBadge) {
        statusBadge.textContent = isIOS ? 'Cần mở từ Màn hình chính' : 'Trình duyệt không hỗ trợ';
        statusBadge.className = 'reminder-status-badge is-denied';
      }
      if (btnTestPush) btnTestPush.style.display = 'none';
      return;
    }

    const perm = Notification.permission;
    if (perm === 'granted') {
      if (statusBadge) {
        statusBadge.textContent = '✓ Đã bật thông báo';
        statusBadge.className = 'reminder-status-badge is-granted';
      }
      if (btnTestPush) btnTestPush.style.display = 'inline-flex';
    } else if (perm === 'denied') {
      if (statusBadge) {
        statusBadge.textContent = '🚫 Bị chặn trong Cài đặt máy';
        statusBadge.className = 'reminder-status-badge is-denied';
      }
      if (btnTestPush) btnTestPush.style.display = 'none';
    } else {
      if (statusBadge) {
        statusBadge.textContent = 'Chưa cấp quyền';
        statusBadge.className = 'reminder-status-badge is-default';
      }
      if (btnTestPush) btnTestPush.style.display = 'none';
    }
  };

  // Preset time chips click handler
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const chosen = btn.dataset.time;
      if (timeInput) timeInput.value = chosen;
      updatePresetButtons(chosen);
      updatePreview();
    });
  });

  if (timeInput) {
    timeInput.addEventListener('input', () => {
      updatePresetButtons(timeInput.value);
      updatePreview();
    });
    timeInput.addEventListener('change', () => {
      updatePresetButtons(timeInput.value);
      updatePreview();
    });
  }

  // Header quick button: navigate smoothly to Ledger -> Reminder tab
  if (btnOpenHeader) {
    btnOpenHeader.addEventListener('click', () => {
      switchModule('ledger');
      switchLedgerSubTab('reminder');
      const card = document.querySelector('.komo-reminder-card');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // Save & Activate Push
  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        if (isIOS && !isStandalone) {
          await showAlertModal({
            title: 'Yêu cầu mở từ Màn hình chính',
            message: 'Trên iPhone, Apple chỉ cho phép bật thông báo đẩy khi bạn mở trang web từ biểu tượng ngoài Màn hình chính (Add to Home Screen). Hãy bấm nút Chia sẻ (Share ⎋) trong Safari -> Thêm vào MH chính nhé!',
            buttonText: 'Đã hiểu',
            icon: '📱'
          });
          return;
        }
        await showAlertModal({
          title: 'Không hỗ trợ Web Push',
          message: 'Trình duyệt hiện tại không hỗ trợ Web Push Notification. Hãy sử dụng Safari (iPhone) hoặc Chrome nhé!',
          buttonText: 'Đã hiểu',
          icon: '⚠️'
        });
        return;
      }

      btnSave.disabled = true;
      btnSave.textContent = 'Đang kích hoạt...';

      try {
        let perm = Notification.permission;
        if (perm !== 'granted') {
          perm = await Notification.requestPermission();
        }

        if (perm !== 'granted') {
          updateReminderUIState();
          btnSave.disabled = false;
          btnSave.textContent = '💾 Lưu & Bật thông báo';
          await showAlertModal({
            title: 'Chưa được cấp quyền',
            message: 'Bạn chưa cho phép gửi thông báo. Trên iPhone, bạn có thể vào Cài đặt máy > Thông báo > All In One để gạt Cho phép thông báo nhé.',
            buttonText: 'Đã hiểu',
            icon: '🚫'
          });
          return;
        }

        // Wait for service worker ready
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
          });
        }

        const chosenTime = timeInput ? timeInput.value : '21:00';
        localStorage.setItem('aio_reminder_time', chosenTime);
        localStorage.setItem('aio_reminder_enabled', 'true');

        // Save subscription & reminder time to Firebase Realtime Database
        const reminderPayload = {
          profile: currentUserProfile,
          time: chosenTime,
          enabled: true,
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
          updatedAt: Date.now()
        };

        const dbUrl = 'https://all-in-one-86a90-default-rtdb.asia-southeast1.firebasedatabase.app';
        await fetch(`${dbUrl}/reminders/${currentUserProfile}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reminderPayload)
        });

        updateReminderUIState();
        showToast(`Đã bật nhắc nhở chi tiêu lúc ${chosenTime} mỗi ngày thành công!`);

        btnSave.disabled = false;
        btnSave.textContent = '✓ Đã lưu cài đặt';
        setTimeout(() => {
          btnSave.textContent = '💾 Lưu & Bật thông báo';
        }, 2000);
      } catch (err) {
        console.error('Lỗi khi bật thông báo:', err);
        btnSave.disabled = false;
        btnSave.textContent = '💾 Lưu & Bật thông báo';
        await showAlertModal({
          title: 'Lỗi thiết lập thông báo',
          message: 'Không thể đăng ký thông báo đẩy: ' + (err.message || 'Vui lòng thử lại sau.'),
          buttonText: 'Đóng',
          icon: '⚠️'
        });
      }
    });
  }

  // Test Push button
  if (btnTestPush) {
    btnTestPush.addEventListener('click', async () => {
      btnTestPush.disabled = true;
      btnTestPush.textContent = 'Đang gửi thông báo...';

      try {
        const reg = await navigator.serviceWorker.ready;
        const chosenTime = timeInput ? timeInput.value : '21:00';
        const profileName = currentUserProfile === 'em' ? 'Em' : 'Anh';

        if (Notification.permission !== 'granted') {
          throw new Error('Chưa cấp quyền thông báo. Vui lòng bấm "Lưu & Bật thông báo" trước.');
        }

        // Trigger native notification directly via Service Worker
        await reg.showNotification('All In One • Test Thông Báo 🔔', {
          body: `Xin chào ${profileName}! Đã kết nối thông báo thành công. App sẽ nhắc nhở vào lúc ${chosenTime} mỗi ngày nhé!`,
          icon: '/favicon.png',
          badge: '/favicon-32x32.png',
          vibrate: [150, 80, 150],
          tag: 'aio-test-notification',
          renotify: true,
          data: {
            url: '/?tab=ledger&subtab=input'
          }
        });

        showToast('Đã gửi thông báo thử! Bạn hãy kiểm tra thông báo trên máy nhé.');
      } catch (err) {
        console.error('Lỗi gửi push test:', err);
        await showAlertModal({
          title: 'Lỗi gửi thông báo thử',
          message: err.message,
          buttonText: 'Đóng',
          icon: '⚠️'
        });
      } finally {
        btnTestPush.disabled = false;
        btnTestPush.textContent = '⚡ Gửi thử thông báo ngay để test';
      }
    });
  }

  // Initial UI state update
  updateReminderUIState();
}

// Initial Boot
window.addEventListener('DOMContentLoaded', () => {
  initThemeManager();
  initCoupleProfileSwitcher();
  loadFromStorage();
  setupEventListeners();
  render();
  renderCompound();
  initAppleNotes();
  initKomorebiLedger();
  initCloudSync();
  initReminderFeature();

  // URL parameters or last active module
  const urlParams = new URLSearchParams(window.location.search);
  const targetTab = urlParams.get('tab');
  const targetSubtab = urlParams.get('subtab');

  if (targetTab && ['budget', 'compound', 'hub', 'notes', 'ledger'].includes(targetTab)) {
    switchModule(targetTab);
    if (targetTab === 'ledger' && targetSubtab && ['calendar', 'input', 'report', 'budget', 'reminder'].includes(targetSubtab)) {
      switchLedgerSubTab(targetSubtab);
    }
  } else {
    const savedMod = localStorage.getItem(AIO_STORAGE_KEY_MODULE) || 'budget';
    if (['budget', 'compound', 'hub', 'notes', 'ledger'].includes(savedMod)) {
      switchModule(savedMod);
    } else {
      switchModule('budget');
    }
  }
});
