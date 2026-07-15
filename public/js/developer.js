(function() {
  'use strict';

  var devMessages = [];

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

  /* ─── Init ─── */
  function initDeveloper() {
    if (typeof window.hideLoader === 'function') window.hideLoader();
    console.info('[Developer] Initializing developer console...');

    var dateEl = document.getElementById('todayDate');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
