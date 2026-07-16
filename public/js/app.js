'use strict';

window.esc = function(s) {
  if (s == null) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(String(s)));
  return div.innerHTML;
};

var AUTH_DURATION_MS = 12 * 60 * 60 * 1000;

window.HMS = {
  isAuthenticated() {
    var VALID_CODES = ['WMP01', 'WMPAD01', 'WMPDEV01'];
    var stored = localStorage.getItem('hms_auth');
    if (!stored) return false;
    try {
      var parsed = JSON.parse(stored);
      if (VALID_CODES.indexOf(parsed.code) !== -1 && Date.now() - parsed.timestamp < AUTH_DURATION_MS) {
        return true;
      }
    } catch (_) {}
    localStorage.removeItem('hms_auth');
    return false;
  },
  login(code) {
    if (code === 'WMP01') {
      localStorage.setItem('hms_auth', JSON.stringify({
        code: 'WMP01',
        role: 'Reception',
        timestamp: Date.now()
      }));
      if (window.logLoginEvent) {
        window.logLoginEvent('Front Desk', 'Reception', 'reception');
      }
      return true;
    }
    return false;
  },
  logout() {
    var p = Promise.resolve();
    if (window.updateSessionStatus) {
      p = window.updateSessionStatus('logged_out');
    }
    localStorage.removeItem('hms_auth');
    location.reload();
  },
  requireAuth() {
    return this.isAuthenticated();
  }
};
const HMS = window.HMS;
window.HMS_READY = Promise.resolve();

window.handleLogout = function() {
  if (HMS) HMS.logout();
};
/* --- Code-based Login --- */
function initLoginOverlay() {
  var overlay = document.getElementById('loginOverlay');
  if (!overlay) return;

  if (HMS.isAuthenticated()) {
    overlay.classList.remove('active');
    return;
  }

  overlay.classList.add('active');
  if (typeof window.hideLoader === 'function') window.hideLoader();
  document.body.style.overflow = 'hidden';

  var input = document.getElementById('loginCodeInput');
  var error = document.getElementById('loginError');
  var form = document.getElementById('loginForm');

  if (!form || !input) return;

  form.onsubmit = function(e) {
    e.preventDefault();
    var code = input.value.trim();
    if (HMS.login(code)) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      input.value = '';
      if (error) error.style.display = 'none';
      var auth = JSON.parse(localStorage.getItem('hms_auth'));
      showLoginSuccess(auth ? auth.role : '');
    } else {
      if (error) {
        error.textContent = 'Invalid code. Please try again.';
        error.style.display = 'block';
      }
      input.value = '';
      input.focus();
    }
  };

  input.focus();
}

window.addConsoleLog = function addConsoleLog(type, msg) {
  if (typeof console !== 'undefined') console.log('[' + type + '] ' + msg);
};

function showLoginSuccess(role) {
  var el = document.getElementById('loginSuccessOverlay');
  if (!el) return;
  el.querySelector('.ls-role').textContent = role || '';
  el.classList.add('active');
  setTimeout(function() {
    el.classList.remove('active');
  }, 2500);
}

function toast(message, type = 'info', icon = null) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const icons = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="material-icons-round">${icon || icons[type]}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(50px)'; t.style.transition = 'all .3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function closeModal(event, id) {
  if (event && event.target !== event.currentTarget) return;
  const m = document.getElementById(id);
  if (m) { m.classList.remove('active'); document.body.style.overflow = ''; }
}

function labelDynamicTables() {
  document.querySelectorAll('.data-table, .admin-table, .appt-table').forEach(table => {
    const headers = [];
    const ths = table.querySelectorAll('thead th');
    ths.forEach(th => {
      const txt = th.textContent.trim();
      if (th.querySelector('input[type="checkbox"]')) { headers.push(''); }
      else { headers.push(txt || ''); }
    });
    if (headers.length === 0) return;
    table.querySelectorAll('tbody tr').forEach(row => {
      row.querySelectorAll('td').forEach((td, i) => {
        if (!td.hasAttribute('data-label') && i < headers.length) {
          td.setAttribute('data-label', headers[i]);
        }
      });
    });
  });
}

const _origInsert = Element.prototype.insertAdjacentHTML;
if (_origInsert) {
  Element.prototype.insertAdjacentHTML = function(pos, text) {
    _origInsert.call(this, pos, text);
    if (pos === 'beforeend' && (this.closest('.data-table') || this.closest('.admin-table'))) {
      setTimeout(labelDynamicTables, 0);
    }
  };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active, #addStaffModal.active, #editStaffModal.active, #scheduleModal.active').forEach(el => {
      el.classList.remove('active');
    });
    document.body.style.overflow = '';
  }
});

function initSidebar() {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!toggle) return;
  const closeSidebar = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
  };
  const openSidebar = () => {
    sidebar.classList.add('open');
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  };
  toggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) { closeSidebar(); }
    else { openSidebar(); }
  });
  overlay.addEventListener('click', closeSidebar);

  let touchStartX = 0;
  let touchCurrentX = 0;
  const SWIPE_THRESHOLD = 80;
  sidebar.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
  sidebar.addEventListener('touchmove', (e) => { touchCurrentX = e.changedTouches[0].screenX; }, { passive: true });
  sidebar.addEventListener('touchend', () => {
    const diff = touchStartX - touchCurrentX;
    if (diff > SWIPE_THRESHOLD && sidebar.classList.contains('open')) { closeSidebar(); }
  }, { passive: true });
}

function initMobileSearch() {
  const toggleBtn = document.getElementById('mobileSearchToggle');
  const mobileBar = document.getElementById('mobileSearchBar');
  if (!toggleBtn || !mobileBar) return;
  toggleBtn.addEventListener('click', () => {
    const isActive = mobileBar.classList.toggle('active');
    toggleBtn.querySelector('.material-icons-round').textContent = isActive ? 'close' : 'search';
    if (isActive) {
      const input = mobileBar.querySelector('input');
      if (input) setTimeout(() => input.focus(), 100);
    }
  });
}

function initNotifications() {
  const btn = document.getElementById('notifBtn');
  const panel = document.getElementById('notifPanel');
  if (!btn || !panel) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
  });
  document.addEventListener('click', (e) => {
    if (panel && !panel.hidden && !panel.contains(e.target) && e.target !== btn) { panel.hidden = true; }
  });
  const clearBtn = document.getElementById('clearNotif');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    panel.querySelector('.notif-list').innerHTML = '<p style="padding:12px;font-size:.82rem;color:var(--on-surface-var);text-align:center">No new notifications</p>';
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
  });
}

function initPortalTheme() {
  document.body.classList.remove('portal-admin', 'portal-doctor', 'portal-pharmacy', 'portal-lab');
  document.body.classList.add('portal-reception');
}

function initUserDisplay() {
  if (!HMS.isAuthenticated()) return;

  /* Load portals.css if not already loaded */
  if (!document.getElementById('portals-stylesheet')) {
    const link = document.createElement('link');
    link.id = 'portals-stylesheet';
    link.rel = 'stylesheet';
    link.href = 'css/portals.css';
    document.head.appendChild(link);
  }

  const avatarEl = document.getElementById('userAvatar');
  const topbarAvatarEl = document.getElementById('topbarAvatar');
  if (avatarEl) avatarEl.textContent = 'FD';
  if (topbarAvatarEl) topbarAvatarEl.textContent = 'FD';

  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  if (nameEl) nameEl.textContent = 'Front Desk';
  if (roleEl) roleEl.textContent = 'Reception';

  initPortalTheme();
}


function initDateDisplay() {
  const el = document.getElementById('todayDate');
  if (!el) return;
  const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  el.textContent = new Date().toLocaleDateString('en-IN', opts);
}

function initGreeting() {
  const el = document.getElementById('dashboardGreeting');
  if (!el) return;
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  el.textContent = g + '! Front Desk is ready.';
}

function switchTab(btn, tabId) {
  btn.closest('.tab-bar').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => { c.hidden = true; });
  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.hidden = false;
}

function animateCounter(el, target) {
  el.dataset.target = target;
  const duration = 800;
  const start = performance.now();
  const startVal = parseInt(el.textContent, 10) || 0;
  const diff = target - startVal;
  
  const animId = Math.random();
  el.dataset.animId = animId;

  function update(now) {
    if (el.dataset.animId !== String(animId)) return;
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(startVal + eased * diff).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function animateCounters() {
  document.querySelectorAll('.counter').forEach(el => {
    const target = parseInt(el.dataset.target, 10) || 0;
    animateCounter(el, target);
  });
}
window.animateCounter = animateCounter;

function sfChipSelect(btn, prefix, type) {
  const chips = btn.closest('.sf-chips');
  if (chips) chips.querySelectorAll('.sf-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const customRange = document.getElementById(`${prefix}CustomRange`);
  if (type === 'custom') {
    if (customRange) customRange.classList.add('expanded');
  } else {
    if (customRange) customRange.classList.remove('expanded');
    sfApplyPresetFilter(prefix, type);
  }
}

function sfGetPresetBounds(type) {
  const now = new Date();
  let start = new Date();
  let end = new Date();
  if (type === 'today') { start.setHours(0,0,0,0); end.setHours(23,59,59,999); }
  else if (type === 'yesterday') { start.setDate(now.getDate() - 1); start.setHours(0,0,0,0); end.setDate(now.getDate() - 1); end.setHours(23,59,59,999); }
  else if (type === '7days') { start.setDate(now.getDate() - 7); start.setHours(0,0,0,0); end.setHours(23,59,59,999); }
  else if (type === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0); end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); }
  return { start, end };
}

function sfApplyPresetFilter(prefix, type) {
  const bounds = sfGetPresetBounds(type);
  const formatLocalDate = (d) => { const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const date = String(d.getDate()).padStart(2, '0'); return `${year}-${month}-${date}`; };
  const startDateStr = formatLocalDate(bounds.start);
  const startTimeStr = String(bounds.start.getHours()).padStart(2, '0') + ':' + String(bounds.start.getMinutes()).padStart(2, '0');
  const endDateStr = formatLocalDate(bounds.end);
  const endTimeStr = String(bounds.end.getHours()).padStart(2, '0') + ':' + String(bounds.end.getMinutes()).padStart(2, '0');
  const startD = document.getElementById(`${prefix}StartDate`);
  const startT = document.getElementById(`${prefix}StartTime`);
  const endD = document.getElementById(`${prefix}EndDate`);
  const endT = document.getElementById(`${prefix}EndTime`);
  if (startD) startD.value = startDateStr;
  if (startT) startT.value = startTimeStr;
  if (endD) endD.value = endDateStr;
  if (endT) endT.value = endTimeStr;
  sfExecutePortalFilter(prefix);
}

function sfApplyCustom(prefix) { sfExecutePortalFilter(prefix); }

function sfClearFilter(prefix) {
  const startD = document.getElementById(`${prefix}StartDate`);
  const startT = document.getElementById(`${prefix}StartTime`);
  const endD = document.getElementById(`${prefix}EndDate`);
  const endT = document.getElementById(`${prefix}EndTime`);
  if (startD) startD.value = '';
  if (startT) startT.value = '';
  if (endD) endD.value = '';
  if (endT) endT.value = '';
  const filterEl = document.getElementById(`${prefix}SmartFilter`);
  if (filterEl) {
    filterEl.querySelectorAll('.sf-chip').forEach(c => c.classList.remove('active'));
    const todayChip = filterEl.querySelector(`.sf-chip[onclick*="'today'"]`);
    if (todayChip) todayChip.classList.add('active');
  }
  const customRange = document.getElementById(`${prefix}CustomRange`);
  if (customRange) customRange.classList.remove('expanded');
  sfExecutePortalClear(prefix);
}

function sfExecutePortalFilter(prefix) {
  if (prefix === 'doc') { if (typeof filterPatientQueue === 'function') filterPatientQueue(); }
  else if (prefix === 'opd') { if (typeof filterOpdQueue === 'function') filterOpdQueue(); }
  else if (prefix === 'rx') { if (typeof filterRxQueue === 'function') filterRxQueue(); }
  else if (prefix === 'lab') { if (typeof filterSpecimenQueue === 'function') filterSpecimenQueue(); }
  else if (prefix === 'admin') { if (typeof applyAdminFilter === 'function') applyAdminFilter(); }
}

function sfExecutePortalClear(prefix) {
  if (prefix === 'doc') { if (typeof clearPatientQueueFilter === 'function') clearPatientQueueFilter(); }
  else if (prefix === 'opd') { if (typeof clearOpdQueueFilter === 'function') clearOpdQueueFilter(); }
  else if (prefix === 'rx') { if (typeof clearRxQueueFilter === 'function') clearRxQueueFilter(); }
  else if (prefix === 'lab') { if (typeof clearSpecimenQueueFilter === 'function') clearSpecimenQueueFilter(); }
  else if (prefix === 'admin') { if (typeof clearAdminFilter === 'function') clearAdminFilter(); }
}

function checkApiReady() {
  if (!SHEETS_API_URL) {
    var body = document.querySelector('.page-body') || document.querySelector('main') || document.body;
    if (body) {
      body.innerHTML = '<div style="text-align:center;padding:80px 20px;"><span class="material-icons-round" style="font-size:64px;color:var(--error,#ef4444);margin-bottom:16px;">cloud_off</span><h2>API Not Configured</h2><p style="color:var(--on-surface-var);max-width:500px;margin:12px auto;">Set <code style="background:var(--surface-low);padding:2px 8px;border-radius:4px;">SHEETS_API_URL</code> in <code style="background:var(--surface-low);padding:2px 8px;border-radius:4px;">public/js/sheets-api.js</code> to your Apps Script deployment URL.</p><a href="scripts/README.md" style="color:var(--primary-light);font-weight:600;">See setup guide</a></div>';
    }
    return false;
  }
  return true;
}

document.addEventListener('DOMContentLoaded', () => {
  initLoginOverlay();
  if (!HMS.isAuthenticated()) return;
  if (!checkApiReady()) return;
  initSidebar();
  initNotifications();
  initUserDisplay();
  initDateDisplay();
  initGreeting();
  animateCounters();
  initMobileSearch();
  setTimeout(labelDynamicTables, 100);
  window.hideLoader();
});

/* --- Global Search --- */
function initGlobalSearch() {
  var searchInput = document.getElementById('globalSearch');
  var mobileSearchInput = document.getElementById('globalSearchMobile');

  function handleSearch(e) {
    if (e.key !== 'Enter') return;
    var q = e.target.value.trim();
    if (!q) return;

    var mobileBar = document.getElementById('mobileSearchBar');
    if (mobileBar && mobileBar.classList.contains('active')) {
      mobileBar.classList.remove('active');
      var toggleBtn = document.getElementById('mobileSearchToggle');
      if (toggleBtn) toggleBtn.querySelector('.material-icons-round').textContent = 'search';
    }

    var pageSection = document.querySelector('.page-section.active');
    if (pageSection && pageSection.id === 'page-patients') {
      var patientSearch = document.getElementById('patientSearch');
      if (patientSearch) { patientSearch.value = q; patientSearch.dispatchEvent(new Event('input')); toast('Filtering patients for "' + q + '"', 'info', 'search'); }
    } else if (pageSection && pageSection.id === 'page-skin') {
      var skinSearch = document.getElementById('skinSearch');
      if (skinSearch) { skinSearch.value = q; skinSearch.dispatchEvent(new Event('input')); toast('Filtering skin registry for "' + q + '"', 'info', 'search'); }
    } else if (pageSection && pageSection.id === 'page-ortho') {
      var orthoSearch = document.getElementById('orthoSearch');
      if (orthoSearch) { orthoSearch.value = q; orthoSearch.dispatchEvent(new Event('input')); toast('Filtering orthopedic registry for "' + q + '"', 'info', 'search'); }
    } else {
      toast('Searching for "' + q + '" in patient registry...', 'info', 'search');
      switchPage('patients');
      setTimeout(function() {
        var patientSearch = document.getElementById('patientSearch');
        if (patientSearch) { patientSearch.value = q; patientSearch.dispatchEvent(new Event('input')); }
      }, 100);
    }
  }

  if (searchInput) searchInput.addEventListener('keydown', handleSearch);
  if (mobileSearchInput) mobileSearchInput.addEventListener('keydown', handleSearch);
}

document.addEventListener('DOMContentLoaded', initGlobalSearch);

var _tabStates = {};

function _saveTabState(id) {
  var pane = document.getElementById(id);
  if (!pane) return;
  var state = { inputs: {}, scrolls: {} };
  pane.querySelectorAll('input, select, textarea').forEach(function(el) {
    if (el.id) state.inputs[el.id] = el.value;
  });
  pane.querySelectorAll('[style*="overflow"]').forEach(function(el, i) {
    state.scrolls[i] = el.scrollTop;
  });
  _tabStates[id] = state;
}

function _restoreTabState(id) {
  var state = _tabStates[id];
  if (!state) return;
  Object.keys(state.inputs).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = state.inputs[id];
  });
  var pane = document.getElementById(id);
  if (pane) {
    pane.querySelectorAll('[style*="overflow"]').forEach(function(el, i) {
      if (state.scrolls[i] !== undefined) el.scrollTop = state.scrolls[i];
    });
  }
}

window.switchDashboardTab = function(tabId, event) {
  var current = document.querySelector('.dashboard-tab-pane.active');
  if (current) _saveTabState(current.id);
  document.querySelectorAll('.dashboard-tab-pane').forEach(function(pane) { pane.classList.remove('active'); });
  document.querySelectorAll('.dashboard-tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
  var targetPane = document.getElementById(tabId);
  if (targetPane) {
    targetPane.classList.add('active');
    _restoreTabState(tabId);
  }
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
};

window.populateDepartmentSelects = function() {
  window.API.getDepartments().then(function(resp) {
    var depts = (resp && resp.data) || [];
    var deptNames = depts.map(function(d) { return d.name; });
    var selectIds = ['deptFilter', 'pDept', 'editDept'];
    selectIds.forEach(function(id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      var currentVal = sel.value;
      if (id === 'pDept' && !currentVal) currentVal = 'General Practitioner';
      var defaultLabel = id === 'deptFilter' ? 'All Departments' : 'Select';
      sel.innerHTML = '<option value="">' + defaultLabel + '</option>';
      deptNames.forEach(function(n) {
        sel.innerHTML += '<option' + (n === currentVal ? ' selected' : '') + '>' + esc(n) + '</option>';
      });
    });
  });
};

window.populateSkinDropdowns = function() {
  // Skin dropdowns are static HTML; no dynamic population needed.
};

window.populateAllDropdowns = function() {
  if (typeof window.populateDepartmentSelects === 'function') window.populateDepartmentSelects();
  if (typeof window.populateDoctorDropdowns === 'function') window.populateDoctorDropdowns();
  if (typeof window.populateSkinDropdowns === 'function') window.populateSkinDropdowns();
};

window.populateDoctorDropdowns = function() {
  window.API.getDoctors().then(function(resp) {
    var docs = (resp && resp.data) || [];
    var doctorOptions = '<option value="">— Select Doctor —</option>' +
      docs.map(function(d) {
        return '<option value="' + esc(d.name) + '">' + esc(d.name) + ' (' + esc(d.dept) + ')</option>';
      }).join('');

    // Appointment doctor (keeps id as value)
    var apptDoc = document.getElementById('apptDoctor');
    if (apptDoc) {
      apptDoc.innerHTML = docs.length
        ? docs.map(function(d) {
            return '<option value="' + esc(d.id) + '">' + esc(d.name) + ' (' + esc(d.dept) + ')</option>';
          }).join('')
        : '<option>No doctors available</option>';
    }

    // Add Patient modal — Consulting Doctor
    var pDoc = document.getElementById('pDoctor');
    if (pDoc) {
      var curVal = pDoc.value;
      pDoc.innerHTML = doctorOptions;
      if (curVal) pDoc.value = curVal;
    }

    // Edit Patient modal — Consulting Doctor
    var editDoc = document.getElementById('editDoctor');
    if (editDoc) {
      var curEditVal = editDoc.value;
      editDoc.innerHTML = doctorOptions;
      if (curEditVal) editDoc.value = curEditVal;
    }
  });
};

/* --- Page Navigation (SPA) --- */
window.switchPage = function(page) {
  document.querySelectorAll('.page-section').forEach(function(s) { s.classList.remove('active'); });
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(i) { i.classList.remove('active'); });
  var section = document.getElementById('page-' + page);
  if (section) section.classList.add('active');
  var navItem = document.getElementById('nav-' + page);
  if (navItem) navItem.classList.add('active');
  if (page === 'patients' && typeof initPatientsPage === 'function') {
    initPatientsPage();
  }
  if (page === 'skin' && typeof initSkinPage === 'function') {
    initSkinPage();
  }
  if (page === 'ortho' && typeof initOrthoPage === 'function') {
    initOrthoPage();
  }
  if (page === 'help') {
    closeHelpGuide();
  }
};

/* --- Help Guide Viewer --- */
window.openHelpGuide = function(guideId) {
  document.getElementById('helpGuides').style.display = 'none';
  var viewer = document.getElementById('helpViewer');
  viewer.style.display = 'block';
  document.getElementById('helpIframe').src = 'https://scribehow.com/embed/' + guideId + '?as=video';
};

window.closeHelpGuide = function() {
  document.getElementById('helpViewer').style.display = 'none';
  document.getElementById('helpGuides').style.display = 'flex';
  document.getElementById('helpIframe').src = '';
};

document.addEventListener('DOMContentLoaded', function() {
  var params = new URLSearchParams(window.location.search);
  var searchQ = params.get('search');
  if (searchQ) {
    var gs = document.getElementById('globalSearch');
    if (gs) gs.value = searchQ;
    var patientSearch = document.getElementById('patientSearch');
    if (patientSearch) { patientSearch.value = searchQ; patientSearch.dispatchEvent(new Event('input')); }
  }
});


// --- Page Loader Logic ---
(function() {
  var messages = [
    'Initializing system...',
    'Connecting to medical database...',
    'Securing reception environment...',
    'Loading patient registrations...',
    'Syncing Google Sheets data...',
    'Optimizing workspace view...',
    'Welcome to Front Desk harmony!'
  ];
  var msgIndex = 0;
  var intervalId = null;

  function setMsg(text) {
    var el = document.getElementById('loaderMsg');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(function() {
      el.textContent = text;
      el.style.opacity = '1';
    }, 300);
  }

  function rotateMessages() {
    var el = document.getElementById('loaderMsg');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(function() {
      msgIndex = (msgIndex + 1) % messages.length;
      el.textContent = messages[msgIndex];
      el.style.opacity = '1';
    }, 300);
  }

  function startRotation() {
    var el = document.getElementById('loaderMsg');
    if (!el) return;
    el.textContent = messages[0];
    el.style.transition = 'opacity 0.3s ease';
    intervalId = setInterval(rotateMessages, 2000);
  }

  function stopRotation() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function showNetworkStatus() {
    stopRotation();
    if (!navigator.onLine) {
      setMsg('No internet connection — please check your network');
    } else {
      setMsg('Still loading — check your connection or try reloading');
    }
  }

  window.showLoader = function() {
    var loader = document.getElementById('pageLoader');
    if (loader) {
      loader.classList.remove('hidden');
      msgIndex = 0;
      startRotation();
    }
  };

  window.hideLoader = function() {
    var loader = document.getElementById('pageLoader');
    if (loader) {
      stopRotation();
      loader.classList.add('hidden');
    }
  };

  // Start on load
  var loader = document.getElementById('pageLoader');
  if (loader && !loader.classList.contains('hidden')) {
    startRotation();
    // If not hidden within 3s, show network status update
    setTimeout(function() {
      if (!loader.classList.contains('hidden')) {
        showNetworkStatus();
      }
    }, 3000);
  }
})();

// --- Button Loading State Utilities ---
window.setButtonLoading = function(btn, label) {
  if (!btn) return;
  var orig = btn.innerHTML;
  btn.setAttribute('data-original-html', orig);
  btn.disabled = true;
  btn.classList.add('btn-loading');
  btn.innerHTML = '<span class="spinner-sm"></span> ' + (label || 'Loading...');
};

window.setButtonIdle = function(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.classList.remove('btn-loading');
  btn.innerHTML = btn.getAttribute('data-original-html') || 'Submit';
};

