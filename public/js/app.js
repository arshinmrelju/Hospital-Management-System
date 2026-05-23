'use strict';

/* --- Auth / Session --- */
function ensureHMS() {
  if (!window.HMS) {
    window.HMS = {
      getUser() {
        try { return JSON.parse(sessionStorage.getItem('hms_session') || 'null'); }
        catch (_) { return null; }
      },
      setUser(user) { sessionStorage.setItem('hms_session', JSON.stringify(user)); },
      logout() {
        sessionStorage.removeItem('hms_session');
        if (window.firebaseAuth) {
          import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js')
            .then(m => m.signOut(window.firebaseAuth)).catch(() => {});
        }
        location.href = 'index.html';
      },
      requireAuth() {
        const user = this.getUser();
        if (user) return user;
        const tryRedirect = () => {
          if (!this.getUser()) location.href = 'index.html';
        };
        // Wait for firebase-init.js module to load and onAuthStateChanged to fire
        if (window._authReady === undefined) {
          const poll = setInterval(() => {
            if (window._authReady !== undefined) {
              clearInterval(poll);
              window._authReady.then(tryRedirect);
            }
          }, 50);
          setTimeout(() => { clearInterval(poll); tryRedirect(); }, 3000);
        } else {
          window._authReady.then(tryRedirect);
        }
        return null;
      }
    };
  }
  return window.HMS;
}
ensureHMS();
const HMS = window.HMS;

/* Expose HMS globally for pages that call it at top level */
window.HMS_READY = window._authReady || Promise.resolve();

/* Global console-log helper used by many pages */
window.addConsoleLog = window.addConsoleLog || function addConsoleLog(type, msg) {
  if (typeof console !== 'undefined') console.log('[' + type + '] ' + msg);
};

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

function initSidebar() {
  const toggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
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
    if (panel && !panel.hidden && !panel.contains(e.target) && e.target !== btn) {
      panel.hidden = true;
    }
  });
  const clearBtn = document.getElementById('clearNotif');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    panel.querySelector('.notif-list').innerHTML = '<p style="padding:12px;font-size:.82rem;color:var(--on-surface-var);text-align:center">No new notifications</p>';
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
  });
}

function initUserDisplay() {
  const user = HMS.getUser();
  if (!user) return;

  if (!document.getElementById('portals-stylesheet')) {
    const link = document.createElement('link');
    link.id = 'portals-stylesheet';
    link.rel = 'stylesheet';
    link.href = 'css/portals.css';
    document.head.appendChild(link);
  }

  const nameEl = document.getElementById('sidebarUserName');
  const roleEl = document.getElementById('sidebarUserRole');
  const avatarEl = document.getElementById('userAvatar');
  const topbarAvatarEl = document.getElementById('topbarAvatar');
  const initials = (user.name || 'User').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (nameEl) nameEl.textContent = user.name || 'User';
  if (roleEl) roleEl.textContent = user.title ? `${user.title} · ${user.role}` : user.role;
  if (avatarEl) avatarEl.textContent = initials;
  if (topbarAvatarEl) topbarAvatarEl.textContent = initials;

  const role = user.role;
  document.body.classList.remove('portal-admin', 'portal-doctor', 'portal-pharmacy', 'portal-lab', 'portal-reception');
  if (role === 'Admin') {
    document.body.classList.add('portal-admin');
  } else if (role === 'Doctor') {
    document.body.classList.add('portal-doctor');
  } else if (role === 'Pharmacist') {
    document.body.classList.add('portal-pharmacy');
  } else if (role === 'Lab Tech') {
    document.body.classList.add('portal-lab');
  } else {
    document.body.classList.add('portal-reception');
  }

  const adminNavLink = document.getElementById('nav-admin');
  if (adminNavLink && role === 'Admin') {
    adminNavLink.style.display = 'flex';
  }

  if (role === 'Doctor') {
    const itemsToHide = ['nav-patients', 'nav-appointments', 'nav-pharmacy', 'nav-lab', 'nav-reports'];
    itemsToHide.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const headerActionBtn = document.getElementById('headerActionBtn');
    if (headerActionBtn) headerActionBtn.style.display = 'none';
  }

  if (role === 'Pharmacist') {
    const itemsToHide = ['nav-dashboard', 'nav-patients', 'nav-appointments', 'nav-doctors', 'nav-lab', 'nav-admin', 'nav-settings', 'nav-reports'];
    itemsToHide.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  const page = window.location.pathname.split('/').pop();
  if (page === 'dashboard.html' || page === '') {
    const redirects = {
      Admin: 'admin-dashboard.html',
      Doctor: 'doctor-dashboard.html',
      Staff: 'reception-dashboard.html',
      Pharmacist: 'pharmacy-dashboard.html',
      'Lab Tech': 'lab-dashboard.html'
    };
    const target = redirects[role];
    if (target) window.location.href = target;
  }
}

function initLogout() {
  const btn = document.getElementById('logoutBtn');
  if (btn) btn.addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) HMS.logout();
  });
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
  const user = HMS.getUser();
  el.textContent = `${g}, ${user ? user.name.split(' ')[0] : 'User'}! Here's your workspace overview.`;
}

function switchTab(btn, tabId) {
  btn.closest('.tab-bar').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const prefix = tabId.split('-')[0];
  document.querySelectorAll('.tab-content').forEach(c => { c.hidden = true; });
  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.hidden = false;
}

function animateCounters() {
  document.querySelectorAll('.counter').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    const duration = 1200;
    const start = performance.now();
    function update(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
}

function sfChipSelect(btn, prefix, type) {
  const chips = btn.closest('.sf-chips');
  if (chips) {
    chips.querySelectorAll('.sf-chip').forEach(c => c.classList.remove('active'));
  }
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
  if (type === 'today') {
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
  } else if (type === 'yesterday') {
    start.setDate(now.getDate() - 1);
    start.setHours(0,0,0,0);
    end.setDate(now.getDate() - 1);
    end.setHours(23,59,59,999);
  } else if (type === '7days') {
    start.setDate(now.getDate() - 7);
    start.setHours(0,0,0,0);
    end.setHours(23,59,59,999);
  } else if (type === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return { start, end };
}

function sfApplyPresetFilter(prefix, type) {
  const bounds = sfGetPresetBounds(type);
  const formatLocalDate = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  };
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

document.addEventListener('DOMContentLoaded', () => {
  initSidebar();
  initNotifications();
  initUserDisplay();
  initLogout();
  initDateDisplay();
  initGreeting();
  animateCounters();
});

/* --- Global Search --- */
function initGlobalSearch() {
  var searchInput = document.getElementById('globalSearch');
  if (!searchInput) return;

  searchInput.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter') return;
    var q = searchInput.value.trim();
    if (!q) return;

    var path = window.location.pathname.split('/').pop() || 'dashboard.html';

    // Page-specific search routing
    if (path === 'patients.html') {
      // Trigger the patient search on the page
      var patientSearch = document.getElementById('patientSearch');
      if (patientSearch) {
        patientSearch.value = q;
        patientSearch.dispatchEvent(new Event('input'));
        toast('Filtering patients for "' + q + '"', 'info', 'search');
      }
    } else if (path === 'pharmacy.html') {
      // Trigger the medicine search on the page
      var medSearch = document.getElementById('medSearch');
      if (medSearch) {
        medSearch.value = q;
        medSearch.dispatchEvent(new Event('input'));
        toast('Filtering medicines for "' + q + '"', 'info', 'search');
      }
    } else if (path === 'appointments.html') {
      // Trigger appointment search
      var aptSearch = document.getElementById('apptSearch');
      if (aptSearch) {
        aptSearch.value = q;
        aptSearch.dispatchEvent(new Event('input'));
        toast('Filtering appointments for "' + q + '"', 'info', 'search');
      }
    } else if (path === 'reports.html') {
      // Trigger transaction search
      var txnSearch = document.getElementById('searchTxn');
      if (txnSearch) {
        txnSearch.value = q;
        txnSearch.dispatchEvent(new Event('input'));
        toast('Filtering transactions for "' + q + '"', 'info', 'search');
      }
    } else {
      // Default: redirect to patients page with search query
      toast('Searching for "' + q + '" across the system...', 'info', 'search');
      setTimeout(function() {
        window.location.href = 'patients.html?search=' + encodeURIComponent(q);
      }, 600);
    }
  });
}

// Initialize global search on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initGlobalSearch);

window.switchDashboardTab = function(tabId, event) {
  document.querySelectorAll('.dashboard-tab-pane').forEach(function(pane) { pane.classList.remove('active'); });
  document.querySelectorAll('.dashboard-tab-btn').forEach(function(btn) { btn.classList.remove('active'); });
  var targetPane = document.getElementById(tabId);
  if (targetPane) targetPane.classList.add('active');
  if (event && event.currentTarget) event.currentTarget.classList.add('active');
};

// Support URL search parameter on patients.html
document.addEventListener('DOMContentLoaded', function() {
  var params = new URLSearchParams(window.location.search);
  var searchQ = params.get('search');
  if (searchQ) {
    var gs = document.getElementById('globalSearch');
    if (gs) gs.value = searchQ;
    var patientSearch = document.getElementById('patientSearch');
    if (patientSearch) {
      patientSearch.value = searchQ;
      patientSearch.dispatchEvent(new Event('input'));
    }
  }
});
