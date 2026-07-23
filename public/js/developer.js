(function() {
  'use strict';

  var devMessages = [];
  var REFRESH_HISTORY_KEY = 'hms_refresh_history';
  var CHECKIN_HISTORY_KEY = 'hms_checkin_history';
  var PORTAL_TABS = {
    reception: ['Dashboard', 'Patients', 'Skin Registry', 'Orthopedic Registry', 'Export Contacts', 'Help'],
    admin: ['Overview', 'Doctors', 'Departments', 'Login History']
  };

  var CACHE_MAP = {
    'hms_patients_cache_v2': 'Patients cache',
    'hms_skin_cache_v1': 'Skin cache',
    'hms_ortho_cache_v1': 'Ortho cache',
    'hms_doctors_cache': 'Doctors cache',
    'hms_patients_cache': 'Legacy patients cache',
    'hms_local_patients': 'Local patients',
    'hms_local_appointments': 'Local appointments',
    'hms_opd_daily_counts': 'OPD daily counts',
    'hms_reg_daily_counts': 'Registration counts',
    'hms_exported_patient_ids': 'Export tracker',
    'hms_last_export_time': 'Last export time',
    'hms_ortho_next_id': 'Ortho ID seq',
    'hms_skin_next_id': 'Skin ID seq'
  };

  function updateCacheBadge() {
    var badge = document.getElementById('navCacheBadge');
    if (!badge) return;
    var count = 0;
    for (var key in CACHE_MAP) {
      if (CACHE_MAP.hasOwnProperty(key)) {
        try { if (localStorage.getItem(key)) count++; } catch(e) {}
      }
    }
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  /* ─── Auth ─── */
  function devLogin(code) {
    if (code === 'WMPDEV01') {
      localStorage.setItem('hms_auth', JSON.stringify({
        code: 'WMPDEV01', name: 'Developer', role: 'Developer', timestamp: Date.now()
      }));
      if (window.logLoginEvent) {
        window.logLoginEvent('Developer', 'Developer', 'developer');
      }
      return true;
    }
    return false;
  }

  function initLogin() {
    var overlay = document.getElementById('loginOverlay');
    if (!overlay) return;
    if (HMS && HMS.isAuthenticated()) {
      overlay.classList.remove('active');
      initDeveloper();
      return;
    }
    overlay.classList.add('active');
    if (typeof window.hideLoader === 'function') window.hideLoader();
    document.body.style.overflow = 'hidden';
    var form = document.getElementById('loginForm');
    var input = document.getElementById('loginCodeInput');
    var error = document.getElementById('loginError');
    if (!form || !input) return;
    form.onsubmit = function(e) {
      e.preventDefault();
      var code = input.value.trim();
      if (devLogin(code)) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        input.value = '';
        if (error) error.style.display = 'none';
        var auth = JSON.parse(localStorage.getItem('hms_auth'));
        showLoginSuccess(auth ? auth.role : 'Developer');
        setTimeout(function() { initDeveloper(); }, 2600);
      } else {
        if (error) { error.textContent = 'Invalid code. Please try again.'; error.style.display = 'block'; }
        input.value = '';
        input.focus();
      }
    };
    input.focus();
  }

  /* ─── Tab Switching ─── */
  window.switchDevTab = function(tabId, btn) {
    document.querySelectorAll('.dev-tab-pane').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(i) { i.classList.remove('active'); });
    document.getElementById(tabId).classList.add('active');
    if (btn) btn.classList.add('active');
  };

  /* ─── Announcements ─── */
  function loadDevAnnouncements() {
    window.API.getMessages().then(function(resp) {
      var msgs = (resp && resp.data) || [];
      var active = msgs.filter(function(m) { return m.status === 'active' && (m.target === 'developer' || m.target === 'all' || !m.target); });
      var bar = document.getElementById('announcementsBar');
      var body = document.getElementById('devAnnouncementsBody');
      if (!bar || !body) return;
      if (active.length === 0) {
        bar.style.display = 'none';
        return;
      }
      bar.style.display = 'block';
      document.getElementById('devAnnouncementsTitle').textContent = active.length === 1 ? '1 Announcement' : active.length + ' Announcements';
      body.innerHTML = active.sort(function(a, b) {
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      }).map(function(m) {
        var date = m.createdAt ? new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return '<div class="announcement-item">' +
          '<h4>' + window.esc(m.title) + '</h4>' +
          '<p>' + window.esc(m.message) + '</p>' +
          (date ? '<div class="ann-date">' + date + '</div>' : '') +
          '</div>';
      }).join('');
    }).catch(function(err) {
      console.warn('[Developer] Failed to load announcements:', err);
    });
  }

  window.toggleDevAnnouncements = function() {
    var body = document.getElementById('devAnnouncementsBody');
    var icon = document.querySelector('#announcementsBar .toggle-icon');
    if (!body || !icon) return;
    var hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    icon.classList.toggle('collapsed', !hidden);
  };

  /* ─── Data Loading ─── */
  function loadDoctorsAndDepts() {
    return Promise.all([
      window.API.getDoctors(),
      window.API.getDepartments()
    ]).then(function(results) {
      var doctors = (results[0] && results[0].data) || [];
      var departments = (results[1] && results[1].data) || [];
      var docEl = document.getElementById('statTotalDoctors');
      var deptEl = document.getElementById('statTotalDepts');
      if (docEl) docEl.textContent = doctors.length;
      if (deptEl) deptEl.textContent = departments.length;
    }).catch(function(err) {
      console.error('[Developer] Failed to load doctors/depts:', err);
    });
  }

  function loadDevMessages() {
    window.API.getMessages().then(function(resp) {
      devMessages = (resp && resp.data) || [];
      renderBroadcasts();
      updateOverviewStats();
    }).catch(function(err) {
      console.error('[Developer] Failed to load messages:', err);
    });
  }

  /* ─── Overview ─── */
  function updateOverviewStats() {
    var broadcastsEl = document.getElementById('statTotalBroadcasts');
    var broadcastTotal = document.getElementById('statBroadcastTotal');
    var broadcastActive = document.getElementById('statBroadcastActive');
    if (broadcastsEl) broadcastsEl.textContent = devMessages.length;
    if (broadcastTotal) broadcastTotal.textContent = devMessages.length;
    if (broadcastActive) broadcastActive.textContent = devMessages.filter(function(m) { return m.status === 'active'; }).length;
  }

  /* ─── Broadcast Tab ─── */
  function renderBroadcasts() {
    renderBroadcastTable();
    renderRecentBroadcasts();
    updateOverviewStats();
  }

  function renderBroadcastTable() {
    var tbody = document.getElementById('broadcastTableBody');
    if (!tbody) return;
    if (devMessages.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--on-surface-var)">' +
        '<span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">campaign</span>No broadcasts sent yet</td></tr>';
      return;
    }
    var sorted = devMessages.slice().sort(function(a, b) {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    tbody.innerHTML = sorted.map(function(m) {
      var statusClass = m.status === 'active' ? 'available' : 'inactive';
      var date = m.createdAt ? new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      return '<tr>' +
        '<td data-label="Date" style="font-size:0.78rem;white-space:nowrap">' + date + '</td>' +
        '<td data-label="Title"><div style="font-weight:700">' + esc(m.title) + '</div></td>' +
        '<td data-label="Message" style="font-size:0.82rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.message) + '</td>' +
        '<td data-label="Sender" style="font-size:0.82rem">' + esc(m.sender || '—') + '</td>' +
        '<td data-label="Status"><span class="badge-status ' + statusClass + '">' + esc(m.status || 'inactive') + '</span></td>' +
        '<td data-label="Action"><button class="btn-icon-only" onclick="deleteBroadcast(\'' + m.id + '\')" title="Delete broadcast" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:18px;padding:4px"><span class="material-icons-round">delete</span></button></td>' +
        '</tr>';
    }).join('');
    setTimeout(labelDynamicTables, 50);
  }

  function renderRecentBroadcasts() {
    var container = document.getElementById('recentBroadcasts');
    if (!container) return;
    var active = devMessages.filter(function(m) { return m.status === 'active'; });
    var sorted = active.slice().sort(function(a, b) {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    if (sorted.length === 0) {
      container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--on-surface-var);font-size:0.85rem">' +
        '<span class="material-icons-round" style="display:block;font-size:32px;margin-bottom:8px;color:var(--outline-var)">campaign</span>No active broadcasts</p>';
      return;
    }
    container.innerHTML = sorted.slice(0, 5).map(function(m) {
      var date = m.createdAt ? new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return '<div style="padding:12px 0;border-bottom:1px solid var(--outline-var)">' +
        '<div style="font-weight:700;font-size:0.85rem;color:var(--on-surface)">' + esc(m.title) + '</div>' +
        '<div style="font-size:0.78rem;color:var(--on-surface-var);margin-top:4px;line-height:1.4">' + esc(m.message) + '</div>' +
        (date ? '<div style="font-size:0.68rem;color:var(--outline);margin-top:6px">' + date + '</div>' : '') +
        '</div>';
    }).join('');
  }

  window.deleteBroadcast = function(id) {
    if (!confirm('Delete this broadcast permanently?')) return;
    window.API.deleteMessage(id).then(function(resp) {
      if (resp && resp.success) {
        toast('Broadcast deleted', 'success', 'delete');
        loadDevMessages();
        loadDevAnnouncements();
      } else {
        toast(resp.error || 'Failed to delete', 'error');
      }
    }).catch(function(err) {
      toast('Failed to delete broadcast', 'error');
      console.error('[Developer] Delete error:', err);
    });
  };

  window.submitBroadcast = function(e) {
    e.preventDefault();
    var title = document.getElementById('broadcastTitle').value.trim();
    var message = document.getElementById('broadcastMessage').value.trim();
    var target = document.getElementById('broadcastTarget').value;
    var status = document.getElementById('broadcastStatus').value;
    if (!title || !message) { toast('Title and message are required', 'warning'); return; }
    var btn = document.getElementById('broadcastSubmitBtn');
    setButtonLoading(btn, 'Sending...');
    window.API.createMessage({
      title: title,
      message: message,
      sender: 'Developer',
      target: target,
      status: status
    }).then(function(resp) {
      if (resp && resp.success) {
        toast('Broadcast sent successfully', 'success', 'campaign');
        document.getElementById('broadcastForm').reset();
        document.getElementById('broadcastTarget').value = 'all';
        document.getElementById('broadcastStatus').value = 'active';
        return loadDevMessages();
      }
      throw new Error(resp.error || 'Failed to send broadcast');
    }).catch(function(err) {
      toast(err.message || 'Failed to send broadcast', 'error');
    }).finally(function() {
      setButtonIdle(btn);
    });
  };

  /* ─── Maintenance Tab ─── */
  function getRefreshHistory() {
    try {
      return JSON.parse(localStorage.getItem(REFRESH_HISTORY_KEY)) || [];
    } catch(e) { return []; }
  }

  function saveRefreshHistory(history) {
    try { localStorage.setItem(REFRESH_HISTORY_KEY, JSON.stringify(history)); } catch(e) {}
  }

  function loadMaintenanceStats() {
    var history = getRefreshHistory();
    var countEl = document.getElementById('mntCacheCount');
    var lastEl = document.getElementById('mntLastRefresh');
    var totalEl = document.getElementById('mntTotalCleared');
    if (countEl) {
      var c = 0;
      for (var k in CACHE_MAP) { if (CACHE_MAP.hasOwnProperty(k)) { try { if (localStorage.getItem(k)) c++; } catch(e) {} } }
      countEl.textContent = c;
    }
    if (totalEl) {
      var total = history.reduce(function(s, h) { return s + (h.items || 0); }, 0);
      totalEl.textContent = total + ' items';
    }
    if (lastEl) {
      if (history.length > 0) {
        var last = history[history.length - 1];
        var d = new Date(last.timestamp);
        lastEl.textContent = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } else {
        lastEl.textContent = 'Never';
      }
    }
  }

  function renderRefreshHistory() {
    var tbody = document.getElementById('refreshHistoryBody');
    if (!tbody) return;
    var history = getRefreshHistory();
    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--on-surface-var)">' +
        '<span class="material-icons-round" style="display:block;font-size:36px;margin-bottom:6px;color:var(--outline-var)">history</span>No refresh history yet</td></tr>';
      return;
    }
    var reversed = history.slice().reverse();
    tbody.innerHTML = reversed.map(function(h) {
      var d = new Date(h.timestamp);
      var dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      var statusClass = h.status === 'success' ? 'available' : 'inactive';
      var cachesStr = (h.caches && h.caches.length > 0) ? h.caches.join(', ') : '—';
      var sizeStr = h.size || '—';
      return '<tr>' +
        '<td data-label="Time" style="font-size:0.78rem;white-space:nowrap">' + dateStr + '</td>' +
        '<td data-label="Items">' + (h.items || 0) + '</td>' +
        '<td data-label="Size">' + sizeStr + '</td>' +
        '<td data-label="Caches" style="font-size:0.78rem;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(cachesStr) + '</td>' +
        '<td data-label="Status"><span class="badge-status ' + statusClass + '">' + esc(h.status || 'success') + '</span></td>' +
        '</tr>';
    }).join('');
    setTimeout(labelDynamicTables, 50);
  }

  window.clearRefreshHistory = function() {
    if (!confirm('Clear all refresh history entries?')) return;
    saveRefreshHistory([]);
    renderRefreshHistory();
    loadMaintenanceStats();
    toast('Refresh history cleared', 'info', 'delete_sweep');
  };

  /* ─── Check-in ─── */
  window.openCheckinModal = function(entry) {
    initCheckinForm();
    var isEdit = entry && entry.id;
    var headerTitle = document.getElementById('checkinModalHeaderTitle');
    var submitBtn = document.getElementById('checkinSubmitBtn');
    if (isEdit) {
      window._editingCheckinId = entry.id;
      document.getElementById('checkinDate').value = entry.date;
      document.getElementById('checkinDeveloper').value = entry.developer || 'Arshin';
      document.getElementById('checkinStatus').value = entry.status || 'Stable';
      document.getElementById('checkinIssues').value = entry.issuesFound || '';
      document.getElementById('checkinResolved').value = entry.issuesResolved || '';
      document.getElementById('checkinNotes').value = entry.notes || '';
      if (entry.pages && entry.pages.length > 0) {
        var firstPage = entry.pages[0];
        if (firstPage === 'For Review') {
          document.getElementById('checkinPortal').value = 'for-review';
          window.updateCheckinTabs();
        } else {
          var parts = firstPage.split(' > ');
          var portalVal = parts[0] === 'Admin' ? 'admin' : 'reception';
          document.getElementById('checkinPortal').value = portalVal;
          window.updateCheckinTabs();
          var tabName = parts.slice(1).join(' > ') || parts[0];
          var radio = document.querySelector('#checkinTabs input[type=radio][value="' + tabName + '"]');
          if (radio) radio.checked = true;
          var label = radio ? radio.closest('.checkin-tab-check') : null;
          if (label) label.classList.add('checked');
        }
      }
      var isOpen = entry.entryStatus !== 'closed';
      if (headerTitle) headerTitle.textContent = isOpen ? 'Close Check-in' : 'Edit Check-in';
      if (submitBtn) submitBtn.innerHTML = '<span class="material-icons-round">' + (isOpen ? 'check_circle' : 'edit') + '</span> ' + (isOpen ? 'Close Check-in' : 'Update Check-in');
    } else {
      window._editingCheckinId = null;
      if (headerTitle) headerTitle.textContent = 'New Check-in';
      if (submitBtn) submitBtn.innerHTML = '<span class="material-icons-round">assignment_turned_in</span> Open Check-in';
    }
    window.updateStatusDot(document.getElementById('checkinStatus'));
    var modal = document.getElementById('checkinModal');
    if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
  };

  window.closeCheckinModal = function(event) {
    if (event && event.target !== event.currentTarget) return;
    var modal = document.getElementById('checkinModal');
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
    window._editingCheckinId = null;
  };
  window.updateStatusDot = function(sel) {
    var dot = document.getElementById('statusDot');
    if (!dot) return;
    var val = sel.value;
    dot.className = 'cf-status-indicator';
    if (val === 'Stable') dot.classList.add('s-stable');
    else if (val === 'Minor Issues') dot.classList.add('s-minor');
    else if (val === 'Critical') dot.classList.add('s-critical');
    else if (val === 'Under Maintenance') dot.classList.add('s-maint');
  };

  window.updateCheckinTabs = function() {
    var portal = document.getElementById('checkinPortal');
    var container = document.getElementById('checkinTabs');
    var field = document.getElementById('checkinTabsField');
    if (!portal || !container) return;
    container.innerHTML = '';
    var selected = portal.value;
    if (selected === 'for-review') {
      if (field) field.style.display = 'none';
      return;
    }
    if (field) field.style.display = '';
    if (!selected) {
      container.innerHTML = '<div class="checkin-tabs-empty">Select a portal to see its tabs</div>';
      return;
    }
    var tabList = PORTAL_TABS[selected] || [];
    tabList.forEach(function(t) {
      var label = document.createElement('label');
      label.className = 'checkin-tab-check';
      var rb = document.createElement('input');
      rb.type = 'radio';
      rb.name = 'checkinTab';
      rb.value = t;
      label.appendChild(rb);
      var span = document.createElement('span');
      span.textContent = t;
      label.appendChild(span);
      container.appendChild(label);
    });
  };

  function getCheckinHistory() {
    try { return JSON.parse(localStorage.getItem(CHECKIN_HISTORY_KEY)) || []; }
    catch(e) { return []; }
  }

  function saveCheckinHistory(history) {
    try { localStorage.setItem(CHECKIN_HISTORY_KEY, JSON.stringify(history)); } catch(e) {}
  }

  function initCheckinForm() {
    var dateInput = document.getElementById('checkinDate');
    if (dateInput) {
      var today = new Date();
      dateInput.value = today.getFullYear() + '-' +
        String(today.getMonth() + 1).padStart(2, '0') + '-' +
        String(today.getDate()).padStart(2, '0');
    }
    var devInput = document.getElementById('checkinDeveloper');
    if (devInput) devInput.value = 'Arshin';
    var heroName = document.getElementById('checkinHeroName');
    if (heroName) heroName.textContent = 'Arshin';
    var heroAvatar = document.getElementById('checkinHeroAvatar');
    if (heroAvatar) heroAvatar.textContent = 'A';
    var heroDate = document.getElementById('checkinHeroDate');
    if (heroDate) heroDate.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var portal = document.getElementById('checkinPortal');
    if (portal) { portal.value = ''; }
    window.updateCheckinTabs();
  }

  window.submitCheckin = function(e) {
    e.preventDefault();
    var date = document.getElementById('checkinDate').value;
    var dev = document.getElementById('checkinDeveloper').value.trim();
    var status = document.getElementById('checkinStatus').value;
    var issues = document.getElementById('checkinIssues').value.trim();
    var resolved = document.getElementById('checkinResolved').value.trim();
    var notes = document.getElementById('checkinNotes').value.trim();
    var portal = document.getElementById('checkinPortal').value;
    var tabsContainer = document.getElementById('checkinTabs');
    var pages = [];
    if (portal === 'for-review') {
      pages = ['For Review'];
    } else if (portal) {
      var checks = tabsContainer.querySelectorAll('input[type=radio]:checked');
      var selectedTabs = Array.prototype.map.call(checks, function(c) { return c.value; });
      var portalLabel = portal === 'reception' ? 'Reception' : 'Admin';
      pages = selectedTabs.map(function(t) { return portalLabel + ' > ' + t; });
    }
    if (!date) { toast('Please select a visit date', 'warning'); return; }
    if (!portal) { toast('Please select a portal to review', 'warning'); return; }
    if (portal !== 'for-review' && pages.length === 0) { toast('Please select at least one tab', 'warning'); return; }
    var btn = document.getElementById('checkinSubmitBtn');
    setButtonLoading(btn, 'Saving...');
    var history = getCheckinHistory();
    var editId = window._editingCheckinId;
    if (editId) {
      for (var i = 0; i < history.length; i++) {
        if (history[i].id === editId) {
          history[i].date = date;
          history[i].developer = dev || 'Arshin';
          history[i].status = status;
          history[i].pages = pages;
          history[i].issuesFound = issues;
          history[i].issuesResolved = resolved;
          history[i].notes = notes;
          if (history[i].entryStatus !== 'closed') history[i].entryStatus = 'closed';
          break;
        }
      }
      saveCheckinHistory(history);
      document.getElementById('checkinForm').reset();
      closeCheckinModal();
      renderCheckinHistory();
      loadCheckinStats();
      setButtonIdle(btn);
      toast('Check-in closed', 'success', 'check_circle');
    } else {
      var entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: date,
        developer: dev || 'Arshin',
        status: status,
        pages: pages,
        issuesFound: issues,
        issuesResolved: resolved,
        notes: notes,
        entryStatus: 'open',
        createdAt: new Date().toISOString()
      };
      history.push(entry);
      saveCheckinHistory(history);
      document.getElementById('checkinForm').reset();
      closeCheckinModal();
      renderCheckinHistory();
      loadCheckinStats();
      setButtonIdle(btn);
      toast('Check-in logged', 'success', 'assignment_turned_in');
    }
  };

  function renderCheckinHistory() {
    renderCheckinTable();
    renderRecentCheckins();
    loadCheckinStats();
  }

  function renderCheckinTable() {
    var tbody = document.getElementById('checkinTableBody');
    if (!tbody) return;
    var history = getCheckinHistory();
    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--on-surface-var)">' +
        '<span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">assignment_turned_in</span>No check-ins yet</td></tr>';
      return;
    }
    var sorted = history.slice().sort(function(a, b) {
      return b.createdAt.localeCompare(a.createdAt);
    });
    tbody.innerHTML = sorted.map(function(c) {
      var d = new Date(c.date + 'T00:00:00');
      var dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      var pagesStr = (c.pages && c.pages.length > 0) ? c.pages.join(', ') : '—';
      var statusClass = c.status === 'Stable' ? 'available' : c.status === 'Minor Issues' ? 'pending' : c.status === 'Critical' ? 'critical' : 'off';
      var isOpen = c.entryStatus !== 'closed';
      var entryBadge = isOpen ? '<span class="badge-status pending" style="font-size:0.62rem;margin-left:4px">Open</span>' : '<span class="badge-status completed" style="font-size:0.62rem;margin-left:4px">Closed</span>';
      var closeBtn = isOpen
        ? '<button class="btn-icon-only" onclick="closeCheckinEntry(\'' + c.id + '\')" title="Close check-in" style="color:#0D9488;background:none;border:none;cursor:pointer;font-size:18px;padding:4px"><span class="material-icons-round">check_circle</span></button>'
        : '<button class="btn-icon-only" onclick="editCheckinEntry(\'' + c.id + '\')" title="Edit check-in" style="color:#2563EB;background:none;border:none;cursor:pointer;font-size:18px;padding:4px"><span class="material-icons-round">edit</span></button>';
      return '<tr>' +
        '<td data-label="Date" style="font-size:0.78rem;white-space:nowrap">' + dateStr + entryBadge + '</td>' +
        '<td data-label="Developer">' + esc(c.developer || 'Developer') + '</td>' +
        '<td data-label="Pages" style="font-size:0.82rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(pagesStr) + '</td>' +
        '<td data-label="Status"><span class="badge-status ' + statusClass + '">' + esc(c.status || 'Stable') + '</span></td>' +
        '<td data-label="Issues Found" style="font-size:0.82rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.issuesFound || '—') + '</td>' +
        '<td data-label="Issues Resolved" style="font-size:0.82rem;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.issuesResolved || '—') + '</td>' +
        '<td data-label="Action" style="white-space:nowrap">' + closeBtn +
        '<button class="btn-icon-only" onclick="deleteCheckin(\'' + c.id + '\')" title="Delete check-in" style="color:#ef4444;background:none;border:none;cursor:pointer;font-size:18px;padding:4px"><span class="material-icons-round">delete</span></button></td>' +
        '</tr>';
    }).join('');
    setTimeout(labelDynamicTables, 50);
  }

  function renderRecentCheckins() {
    var container = document.getElementById('recentCheckins');
    if (!container) return;
    var history = getCheckinHistory();
    var sorted = history.slice().sort(function(a, b) {
      return b.createdAt.localeCompare(a.createdAt);
    });
    if (sorted.length === 0) {
      container.innerHTML = '<div class="checkin-empty-state">' +
        '<span class="material-icons-round">assignment_turned_in</span>' +
        '<p>No check-ins yet</p>' +
        '<span>Click "New Check-in" to log your first visit</span></div>';
      return;
    }
    container.innerHTML = sorted.slice(0, 5).map(function(c) {
      var d = new Date(c.date + 'T00:00:00');
      var dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      var pagesStr = (c.pages && c.pages.length > 0) ? c.pages.join(', ') : 'No pages';
      var statusClass = c.status === 'Stable' ? 'available' : c.status === 'Minor Issues' ? 'pending' : c.status === 'Critical' ? 'critical' : 'off';
      var entryStatusClass = c.entryStatus !== 'closed' ? 'pending' : 'completed';
      var entryStatusLabel = c.entryStatus !== 'closed' ? 'Open' : 'Closed';
      return '<div class="checkin-recent-item">' +
        '<div class="checkin-recent-dot"><span class="material-icons-round">assignment_turned_in</span></div>' +
        '<div class="checkin-recent-info">' +
        '<div class="checkin-recent-name">' + esc(dateStr) + '</div>' +
        '<div class="checkin-recent-meta">Pages: ' + esc(pagesStr) + '</div>' +
        (c.issuesFound ? '<div style="font-size:0.75rem;color:var(--outline);margin-top:3px">Issues: ' + esc(c.issuesFound) + '</div>' : '') +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">' +
        '<span class="badge-status ' + entryStatusClass + '" style="font-size:0.6rem">' + entryStatusLabel + '</span>' +
        '<span class="badge-status ' + statusClass + '" style="font-size:0.6rem">' + esc(c.status) + '</span>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  function loadCheckinStats() {
    var history = getCheckinHistory();
    var totalEl = document.getElementById('checkinTotal');
    var issuesFoundEl = document.getElementById('checkinIssuesFound');
    var issuesResolvedEl = document.getElementById('checkinIssuesResolved');
    if (totalEl) totalEl.textContent = history.length;
    var found = 0, resolved = 0;
    history.forEach(function(c) {
      if (c.issuesFound && c.issuesFound.trim()) found++;
      if (c.issuesResolved && c.issuesResolved.trim()) resolved++;
    });
    if (issuesFoundEl) issuesFoundEl.textContent = found;
    if (issuesResolvedEl) issuesResolvedEl.textContent = resolved;
  }

  window.closeCheckinEntry = function(id) {
    window.editCheckinEntry(id);
  };

  window.editCheckinEntry = function(id) {
    var history = getCheckinHistory();
    for (var i = 0; i < history.length; i++) {
      if (history[i].id === id) {
        window.openCheckinModal(history[i]);
        return;
      }
    }
  };

  window.deleteCheckin = function(id) {
    if (!confirm('Delete this check-in entry permanently?')) return;
    var history = getCheckinHistory();
    history = history.filter(function(c) { return c.id !== id; });
    saveCheckinHistory(history);
    renderCheckinHistory();
    toast('Check-in deleted', 'success', 'delete');
  };

  window.clearCheckinHistory = function() {
    if (!confirm('Clear all check-in history entries?')) return;
    saveCheckinHistory([]);
    renderCheckinHistory();
    toast('Check-in history cleared', 'info', 'delete_sweep');
  };

  /* ─── Init ─── */
  function initDeveloper() {
    if (typeof window.hideLoader === 'function') window.hideLoader();
    console.info('[Developer] Initializing developer console...');

    var dateEl = document.getElementById('todayDate');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Populate cache badge & maintenance stats
    updateCacheBadge();
    loadMaintenanceStats();
    renderRefreshHistory();

    // Initialize check-in stats and history
    loadCheckinStats();
    renderCheckinHistory();

    // Sidebar toggle
    var toggle = document.getElementById('menuToggle');
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (toggle && sidebar && overlay) {
      toggle.addEventListener('click', function() {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('active');
        document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
      });
      overlay.addEventListener('click', function() {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
      });
    }

    // Load data in parallel
    Promise.all([loadDoctorsAndDepts(), loadDevMessages()]).then(function() {
      console.info('[Developer] Data loaded successfully.');
    });

    // Load announcements
    loadDevAnnouncements();
  }

  window.hardRefresh = function() {
    var active = [];
    var activeKeys = [];
    var totalBytes = 0;
    for (var key in CACHE_MAP) {
      if (CACHE_MAP.hasOwnProperty(key)) {
        try {
          var val = localStorage.getItem(key);
          if (val) {
            active.push(CACHE_MAP[key]);
            activeKeys.push(key);
            totalBytes += val.length * 2;
          }
        } catch(e) {}
      }
    }
    var body = document.getElementById('hardRefreshModalBody');
    var loading = document.getElementById('hardRefreshModalLoading');
    var btn = document.getElementById('hardRefreshExecuteBtn');
    if (!body) return;
    if (loading) loading.style.display = 'none';
    if (btn) btn.style.display = '';
    var sizeStr = totalBytes > 10240 ? (totalBytes / 1024).toFixed(1) + ' KB' : totalBytes + ' bytes';
    var html = '';
    if (active.length === 0) {
      html = '<div style="text-align:center;padding:8px 0">' +
        '<span class="material-icons-round" style="font-size:40px;color:var(--outline-var);display:block;margin-bottom:8px">info</span>' +
        '<p style="color:var(--on-surface-var);font-size:0.9rem;margin:0 0 4px">No caches found to clear.</p>' +
        '<p style="color:var(--outline);font-size:0.8rem;margin:0">The Reception tab will still reload with fresh data.</p>' +
        '</div>';
    } else {
      html = '<div style="margin-bottom:16px">' +
        '<div style="display:flex;gap:16px;justify-content:center;margin-bottom:16px">' +
        '<div style="text-align:center;padding:12px 20px;background:var(--surface-low);border-radius:var(--radius-md);min-width:80px">' +
        '<div style="font-size:1.5rem;font-weight:800;color:var(--portal-accent)">' + active.length + '</div>' +
        '<div style="font-size:0.7rem;color:var(--on-surface-var);text-transform:uppercase;letter-spacing:0.04em">Items</div>' +
        '</div>' +
        '<div style="text-align:center;padding:12px 20px;background:var(--surface-low);border-radius:var(--radius-md);min-width:80px">' +
        '<div style="font-size:1.5rem;font-weight:800;color:var(--portal-accent)">' + sizeStr + '</div>' +
        '<div style="font-size:0.7rem;color:var(--on-surface-var);text-transform:uppercase;letter-spacing:0.04em">Size</div>' +
        '</div>' +
        '</div>' +
        '<div style="font-size:0.82rem;color:var(--on-surface-var);margin-bottom:8px;font-weight:600">Caches to clear:</div>' +
        '<div style="max-height:180px;overflow-y:auto">' +
        active.map(function(s) {
          return '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;font-size:0.82rem;color:var(--on-surface);border-radius:var(--radius-sm)">' +
            '<span class="material-icons-round" style="font-size:16px;color:var(--outline-var)">delete_outline</span>' +
            s +
            '</div>';
        }).join('') +
        '</div>' +
        '</div>';
    }
    body.innerHTML = html;
    var modal = document.getElementById('hardRefreshModal');
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    window._hardRefreshData = { active: active, totalBytes: totalBytes, sizeStr: sizeStr };
  };

  window.executeHardRefresh = function() {
    var data = window._hardRefreshData || { active: [], totalBytes: 0, sizeStr: '0 bytes' };
    closeModal(null, 'hardRefreshModal');
    for (var key in CACHE_MAP) {
      if (CACHE_MAP.hasOwnProperty(key)) {
        try { localStorage.removeItem(key); } catch(e) {}
      }
    }
    updateCacheBadge();
    if ('caches' in window) {
      caches.keys().then(function(names) {
        return Promise.all(names.map(function(name) { return caches.delete(name); }));
      });
    }
    var refreshed = false;
    try {
      var bc = new BroadcastChannel('hms_reload');
      bc.postMessage('reload');
      bc.close();
      refreshed = true;
    } catch(e) {}
    if (!refreshed) {
      var w = window.open('index.html', 'wellness_reception');
      if (w) {
        try { w.focus(); } catch(e) {}
        refreshed = true;
      }
    }
    var history = getRefreshHistory();
    history.push({
      timestamp: new Date().toISOString(),
      items: data.active.length,
      size: data.sizeStr,
      caches: data.active.slice(0, 5),
      status: 'success'
    });
    saveRefreshHistory(history);
    loadMaintenanceStats();
    renderRefreshHistory();
    if (data.active.length === 0) {
      toast('No caches to clear — Reception reloaded', 'info', 'refresh');
    } else {
      toast('Cleared ' + data.active.length + ' cache(s) — Reception refreshed', 'success', 'refresh');
    }
    window._hardRefreshData = null;
  };

  window.handleLogout = function() {
    if (HMS) HMS.logout();
  };

  document.addEventListener('DOMContentLoaded', function() {
    var checkReady = setInterval(function() {
      if (typeof HMS !== 'undefined' && HMS && HMS.isAuthenticated) {
        clearInterval(checkReady);
        initLogin();
      }
    }, 50);
    setTimeout(function() { clearInterval(checkReady); }, 5000);
  });

})();
