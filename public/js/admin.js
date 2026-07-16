(function() {
  'use strict';

  var doctors = [];
  var departments = [];
  var filteredDoctors = [];
  var filteredDepts = [];
  var allDoctorsLoaded = false;
  var allDeptsLoaded = false;
  var deptChartInstance = null;
  var statusChartInstance = null;
  var chartsInitialized = false;
  var animatedStats = {};

  /* ─── Auth ─── */
  function adminLogin(code) {
    if (code === 'WMPAD01') {
      localStorage.setItem('hms_auth', JSON.stringify({
        code: 'WMPAD01', name: 'Admin', role: 'Admin', timestamp: Date.now()
      }));
      if (window.logLoginEvent) {
        window.logLoginEvent('Admin', 'Admin', 'admin');
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
      initAdmin();
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
      if (adminLogin(code)) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        input.value = '';
        if (error) error.style.display = 'none';
        var auth = JSON.parse(localStorage.getItem('hms_auth'));
        showLoginSuccess(auth ? auth.role : 'Admin');
        setTimeout(function() { initAdmin(); }, 2600);
      } else {
        if (error) { error.textContent = 'Invalid code. Please try again.'; error.style.display = 'block'; }
        input.value = '';
        input.focus();
      }
    };
    input.focus();
  }

  /* ─── Animated Number Counter ─── */
  function animateValue(el, target, suffix) {
    if (!el) return;
    suffix = suffix || '';
    var start = 0;
    var duration = 600;
    var startTime = null;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.floor(eased * target);
      el.textContent = current + suffix;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = target + suffix;
      }
    }
    requestAnimationFrame(step);
  }

  /* ─── Data Loading ─── */
  function loadDoctors() {
    return window.API.getDoctors().then(function(resp) {
      var list = (resp && resp.data) || [];
      doctors = list;
      filteredDoctors = list.slice();
      allDoctorsLoaded = true;
      renderDoctors();
      updateStats();
    }).catch(function(err) {
      console.error('Failed to load doctors:', err);
      allDoctorsLoaded = true;
      document.getElementById('doctorList').innerHTML = '<div class="empty-state"><span class="material-icons-round empty-state-icon">error_outline</span><div class="empty-state-title">Failed to load</div><div class="empty-state-desc">Could not load doctors. Check your connection.</div></div>';
    });
  }

  function loadDepartments() {
    return window.API.getDepartments().then(function(resp) {
      var list = (resp && resp.data) || [];
      departments = list;
      filteredDepts = list.slice();
      allDeptsLoaded = true;
      renderDepartments();
      updateStats();
    }).catch(function(err) {
      console.error('Failed to load departments:', err);
      allDeptsLoaded = true;
      document.getElementById('deptList').innerHTML = '<div class="empty-state"><span class="material-icons-round empty-state-icon">error_outline</span><div class="empty-state-title">Failed to load</div><div class="empty-state-desc">Could not load departments.</div></div>';
    });
  }

  function populateDeptSelects() {
    var selects = ['docDept', 'editDocDept', 'pDept', 'editDept', 'deptFilter'];
    var deptNames = departments.map(function(d) { return d.name; });
    selects.forEach(function(id) {
      var sel = document.getElementById(id);
      if (!sel) return;
      var currentVal = sel.value;
      sel.innerHTML = '<option value="">Select</option>';
      deptNames.forEach(function(n) {
        sel.innerHTML += '<option' + (n === currentVal ? ' selected' : '') + '>' + esc(n) + '</option>';
      });
    });
    var apptDoctor = document.getElementById('apptDoctor');
    if (apptDoctor) {
      apptDoctor.innerHTML = doctors.map(function(d) {
        return '<option value="' + esc(d.id) + '">' + esc(d.name) + ' (' + esc(d.dept) + ')</option>';
      }).join('');
    }
  }

  /* ─── Render Doctors (Card List) ─── */
  function renderDoctors() {
    var container = document.getElementById('doctorList');
    if (!container) return;

    var skeleton = document.getElementById('doctorSkeleton');
    if (skeleton) skeleton.style.display = 'none';

    if (filteredDoctors.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons-round empty-state-icon">local_hospital</span><div class="empty-state-title">No doctors found</div><div class="empty-state-desc">Add a doctor to get started.</div></div>';
      return;
    }

    container.innerHTML = filteredDoctors.map(function(d, i) {
      var initials = d.initials || (d.name ? d.name.split(' ').map(function(n){return n[0]}).join('').slice(0,2) : 'DR');
      var statusClass = d.status || 'available';
      var qual = d.qualification || '';
      var contact = d.phone || d.email || '';
      return '<div class="doctor-card" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="doctor-card-avatar">' + esc(initials) + '</div>' +
        '<div class="doctor-card-body">' +
          '<div class="doctor-card-name">' + esc(d.name) + ' <span class="doctor-card-id">' + esc(d.id) + '</span></div>' +
          '<div class="doctor-card-meta">' +
            (d.dept ? '<span class="doctor-card-meta-item"><span class="material-icons-round">business</span>' + esc(d.dept) + '</span>' : '') +
            (qual ? '<span class="doctor-card-meta-item"><span class="material-icons-round">school</span>' + esc(qual) + '</span>' : '') +
            (contact ? '<span class="doctor-card-meta-item"><span class="material-icons-round">contact_phone</span>' + esc(contact) + '</span>' : '') +
            '<span class="doctor-card-meta-item"><span class="badge-status ' + statusClass + '">' + esc(statusClass) + '</span></span>' +
          '</div>' +
        '</div>' +
        '<div class="doctor-card-actions">' +
          '<button class="card-action-btn" onclick="editDoctor(\'' + d.id + '\')" title="Edit"><span class="material-icons-round">edit</span></button>' +
          '<button class="card-action-btn danger" onclick="deleteDoctor(\'' + d.id + '\')" title="Delete"><span class="material-icons-round">delete</span></button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ─── Render Departments (Card List) ─── */
  function renderDepartments() {
    var container = document.getElementById('deptList');
    if (!container) return;

    var skeleton = document.getElementById('deptSkeleton');
    if (skeleton) skeleton.style.display = 'none';

    if (filteredDepts.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons-round empty-state-icon">business</span><div class="empty-state-title">No departments found</div><div class="empty-state-desc">Add a department to get started.</div></div>';
      return;
    }

    container.innerHTML = filteredDepts.map(function(d, i) {
      var statusClass = (d.status === 'active') ? 'available' : 'inactive';
      return '<div class="dept-card" style="animation-delay:' + (i * 0.04) + 's">' +
        '<div class="doctor-card-avatar" style="background:linear-gradient(135deg,#8B5CF6,#7C3AED)">' +
          '<span class="material-icons-round" style="font-size:18px">business</span>' +
        '</div>' +
        '<div class="dept-card-body">' +
          '<div class="dept-card-name">' + esc(d.name) + '</div>' +
          (d.description ? '<div class="dept-card-desc">' + esc(d.description) + '</div>' : '') +
          '<div class="dept-card-id">' + esc(d.id) + '</div>' +
        '</div>' +
        '<div class="doctor-card-meta" style="flex-shrink:0">' +
          '<span class="badge-status ' + statusClass + '">' + esc(d.status || 'active') + '</span>' +
        '</div>' +
        '<div class="dept-card-actions">' +
          '<button class="card-action-btn" onclick="editDept(\'' + d.id + '\')" title="Edit"><span class="material-icons-round">edit</span></button>' +
          '<button class="card-action-btn danger" onclick="deleteDepartment(\'' + d.id + '\')" title="Delete"><span class="material-icons-round">delete</span></button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ─── Filters ─── */
  window.filterDoctors = function() {
    var q = (document.getElementById('doctorSearch').value || '').toLowerCase();
    var clearBtn = document.getElementById('doctorSearchClear');
    filteredDoctors = doctors.filter(function(d) {
      return (d.name + ' ' + d.dept + ' ' + d.id + ' ' + (d.qualification || '')).toLowerCase().indexOf(q) !== -1;
    });
    renderDoctors();
    if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';
  };

  window.clearDoctorSearch = function() {
    document.getElementById('doctorSearch').value = '';
    window.filterDoctors();
    document.getElementById('doctorSearch').focus();
  };

  window.filterDepartments = function() {
    var q = (document.getElementById('deptSearch').value || '').toLowerCase();
    var clearBtn = document.getElementById('deptSearchClear');
    filteredDepts = departments.filter(function(d) {
      return (d.name + ' ' + (d.description || '') + ' ' + d.id).toLowerCase().indexOf(q) !== -1;
    });
    renderDepartments();
    if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';
  };

  window.clearDeptSearch = function() {
    document.getElementById('deptSearch').value = '';
    window.filterDepartments();
    document.getElementById('deptSearch').focus();
  };

  /* ─── Stats ─── */
  function updateStats() {
    var totalDocs = doctors.length;
    var avail = doctors.filter(function(d) { return d.status === 'available'; }).length;
    var totalDepts = departments.length;
    animateValue(document.getElementById('statDoctors'), totalDocs);
    animateValue(document.getElementById('statAvailable'), avail);
    animateValue(document.getElementById('statDepartments'), totalDepts);
  }

  /* ─── Tab Switching ─── */
  window.switchAdminTab = function(tabId, btn) {
    document.querySelectorAll('.admin-tab-pane').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.admin-tab').forEach(function(i) { i.classList.remove('active'); });
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(i) { i.classList.remove('active'); });
    document.querySelectorAll('.bottom-nav-item').forEach(function(i) { i.classList.remove('active'); });
    document.getElementById(tabId).classList.add('active');
    if (btn) btn.classList.add('active');
    var nav = document.getElementById('nav-' + tabId.replace('tab-', ''));
    if (nav) nav.classList.add('active');
    var bottomBtn = document.querySelector('.bottom-nav-item[data-tab="' + tabId + '"]');
    if (bottomBtn) bottomBtn.classList.add('active');
    var mobileBar = document.getElementById('mobileSearchBar');
    if (mobileBar) mobileBar.classList.remove('active');
    closeFabMenu();
  };

  window.handleAdminSearch = function() {
    var q = (document.getElementById('adminGlobalSearch').value || document.getElementById('adminGlobalSearchMobile').value || '').toLowerCase();
    if (document.getElementById('adminGlobalSearch').value !== q) document.getElementById('adminGlobalSearch').value = q;
    if (document.getElementById('adminGlobalSearchMobile').value !== q) document.getElementById('adminGlobalSearchMobile').value = q;
    var activeTab = document.querySelector('.admin-tab-pane.active');
    if (!activeTab) return;
    if (activeTab.id === 'tab-doctors') { window.filterDoctors(); }
    else if (activeTab.id === 'tab-departments') { window.filterDepartments(); }
    else if (activeTab.id === 'tab-login-history') { window.filterLoginHistory(); }
  };

  /* ─── FAB ─── */
  window.handleFabAction = function() {
    var fab = document.getElementById('fabBtn');
    var menu = document.getElementById('fabMenu');
    if (!fab || !menu) return;
    var isOpen = menu.classList.contains('visible');
    if (isOpen) {
      closeFabMenu();
    } else {
      menu.classList.add('visible');
      fab.classList.add('open');
    }
  };

  window.closeFabMenu = function() {
    var fab = document.getElementById('fabBtn');
    var menu = document.getElementById('fabMenu');
    if (menu) menu.classList.remove('visible');
    if (fab) fab.classList.remove('open');
  };

  /* Tap outside FAB to close */
  document.addEventListener('click', function(e) {
    var fab = document.getElementById('fabBtn');
    var menu = document.getElementById('fabMenu');
    if (!fab || !menu) return;
    if (!fab.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('visible');
      fab.classList.remove('open');
    }
  });

  /* ─── Doctor CRUD ─── */
  window.openAddDoctorModal = function() {
    var deptSelect = document.getElementById('docDept');
    if (deptSelect) deptSelect.innerHTML = '<option value="">Select</option>' + departments.map(function(d) { return '<option>' + esc(d.name) + '</option>'; }).join('');
    openModal('addDoctorModal');
  };

  window.submitAddDoctor = function(e) {
    e.preventDefault();
    var data = {
      name: document.getElementById('docName').value.trim(),
      initials: document.getElementById('docInitials').value.trim().toUpperCase(),
      dept: document.getElementById('docDept').value,
      qualification: document.getElementById('docQual').value.trim(),
      phone: document.getElementById('docPhone').value.trim(),
      email: document.getElementById('docEmail').value.trim(),
      status: document.getElementById('docStatus').value
    };
    if (!data.name || !data.dept) { toast('Name and Department are required', 'warning'); return; }
    var btn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(btn, 'Adding...');
    window.API.createDoctor(data).then(function(resp) {
      if (resp && resp.success) {
        toast('Doctor added successfully', 'success');
        closeModal(null, 'addDoctorModal');
        document.getElementById('addDoctorForm').reset();
        return loadDoctors();
      }
      throw new Error(resp.error || 'Failed to add doctor');
    }).catch(function(err) {
      toast(err.message || 'Failed to add doctor', 'error');
    }).finally(function() {
      setButtonIdle(btn);
    });
  };

  window.editDoctor = function(id) {
    var d = doctors.find(function(doc) { return doc.id === id; });
    if (!d) return;
    document.getElementById('editDocId').value = d.id;
    document.getElementById('editDoctorTitle').textContent = 'Edit ' + d.name;
    document.getElementById('editDocName').value = d.name || '';
    document.getElementById('editDocInitials').value = d.initials || '';
    var deptSelect = document.getElementById('editDocDept');
    if (deptSelect) {
      deptSelect.innerHTML = '<option value="">Select</option>';
      departments.forEach(function(dep) {
        deptSelect.innerHTML += '<option' + (dep.name === d.dept ? ' selected' : '') + '>' + esc(dep.name) + '</option>';
      });
    }
    document.getElementById('editDocQual').value = d.qualification || '';
    document.getElementById('editDocPhone').value = d.phone || '';
    document.getElementById('editDocEmail').value = d.email || '';
    document.getElementById('editDocStatus').value = d.status || 'available';
    openModal('editDoctorModal');
  };

  window.submitEditDoctor = function(e) {
    e.preventDefault();
    var id = document.getElementById('editDocId').value;
    var data = {
      name: document.getElementById('editDocName').value.trim(),
      initials: document.getElementById('editDocInitials').value.trim().toUpperCase(),
      dept: document.getElementById('editDocDept').value,
      qualification: document.getElementById('editDocQual').value.trim(),
      phone: document.getElementById('editDocPhone').value.trim(),
      email: document.getElementById('editDocEmail').value.trim(),
      status: document.getElementById('editDocStatus').value
    };
    var btn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(btn, 'Saving...');
    window.API.updateDoctor(id, data).then(function(resp) {
      if (resp && resp.success) {
        toast('Doctor updated successfully', 'success');
        closeModal(null, 'editDoctorModal');
        return loadDoctors();
      }
      throw new Error(resp.error || 'Failed to update doctor');
    }).catch(function(err) {
      toast(err.message || 'Failed to update doctor', 'error');
    }).finally(function() {
      setButtonIdle(btn);
    });
  };

  window.deleteDoctor = function(id) {
    if (!confirm('Remove this doctor from the system?')) return;
    window.API.deleteDoctor(id).then(function(resp) {
      if (resp && resp.success) {
        toast('Doctor removed', 'warning', 'delete');
        return loadDoctors();
      }
      throw new Error(resp.error || 'Failed to delete doctor');
    }).catch(function(err) {
      toast(err.message || 'Failed to delete doctor', 'error');
    });
  };

  /* ─── Department CRUD ─── */
  window.openAddDeptModal = function() {
    openModal('addDeptModal');
  };

  window.submitAddDept = function(e) {
    e.preventDefault();
    var data = {
      name: document.getElementById('deptName').value.trim(),
      description: document.getElementById('deptDesc').value.trim(),
      status: document.getElementById('deptStatus').value
    };
    if (!data.name) { toast('Department name is required', 'warning'); return; }
    var btn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(btn, 'Adding...');
    window.API.createDepartment(data).then(function(resp) {
      if (resp && resp.success) {
        toast('Department added successfully', 'success');
        closeModal(null, 'addDeptModal');
        document.getElementById('addDeptForm').reset();
        return loadDepartments();
      }
      throw new Error(resp.error || 'Failed to add department');
    }).catch(function(err) {
      toast(err.message || 'Failed to add department', 'error');
    }).finally(function() {
      setButtonIdle(btn);
    });
  };

  window.editDept = function(id) {
    var d = departments.find(function(dep) { return dep.id === id; });
    if (!d) return;
    document.getElementById('editDeptId').value = d.id;
    document.getElementById('editDeptTitle').textContent = 'Edit ' + d.name;
    document.getElementById('editDeptName').value = d.name || '';
    document.getElementById('editDeptDesc').value = d.description || '';
    document.getElementById('editDeptStatus').value = d.status || 'active';
    openModal('editDeptModal');
  };

  window.submitEditDept = function(e) {
    e.preventDefault();
    var id = document.getElementById('editDeptId').value;
    var data = {
      name: document.getElementById('editDeptName').value.trim(),
      description: document.getElementById('editDeptDesc').value.trim(),
      status: document.getElementById('editDeptStatus').value
    };
    var btn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(btn, 'Saving...');
    window.API.updateDepartment(id, data).then(function(resp) {
      if (resp && resp.success) {
        toast('Department updated successfully', 'success');
        closeModal(null, 'editDeptModal');
        return loadDepartments();
      }
      throw new Error(resp.error || 'Failed to update department');
    }).catch(function(err) {
      toast(err.message || 'Failed to update department', 'error');
    }).finally(function() {
      setButtonIdle(btn);
    });
  };

  window.deleteDepartment = function(id) {
    if (!confirm('Remove this department? All doctors assigned to it will need reassignment.')) return;
    window.API.deleteDepartment(id).then(function(resp) {
      if (resp && resp.success) {
        toast('Department removed', 'warning', 'delete');
        return loadDepartments();
      }
      throw new Error(resp.error || 'Failed to delete department');
    }).catch(function(err) {
      toast(err.message || 'Failed to delete department', 'error');
    });
  };

  window.handleLogout = function() {
    if (HMS) HMS.logout();
  };

  /* ─── Login History ─── */
  var loginHistoryUnsubscribe = null;
  var allLoginSessions = [];

  function formatTimestamp(ts) {
    if (!ts) return '—';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDuration(ms) {
    if (!ms || ms <= 0) return '—';
    var seconds = Math.floor(ms / 1000);
    if (seconds < 60) return seconds + 's';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ' + (seconds % 60) + 's';
    var hours = Math.floor(minutes / 60);
    return hours + 'h ' + (minutes % 60) + 'm';
  }

  function getRelativeTime(ts) {
    if (!ts) return '—';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    var diff = Date.now() - d.getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h ago';
    var days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  function getDeviceShort(ua) {
    if (!ua) return '—';
    if (ua.indexOf('Windows') !== -1) return 'Windows';
    if (ua.indexOf('Mac') !== -1) return 'macOS';
    if (ua.indexOf('Linux') !== -1) return 'Linux';
    if (ua.indexOf('Android') !== -1) return 'Android';
    if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) return 'iOS';
    return 'Unknown';
  }

  function updateLoginStats(sessions) {
    var total = sessions.length;
    var active = sessions.filter(function(s) { return s.status === 'active'; }).length;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayCount = sessions.filter(function(s) {
      var t = s.loginTime;
      if (!t) return false;
      var d = t.toDate ? t.toDate() : new Date(t);
      return d >= today;
    }).length;

    animateValue(document.getElementById('statTotalLogins'), total);
    animateValue(document.getElementById('statActiveSessions'), active);
    animateValue(document.getElementById('statTodayLogins'), todayCount);
  }

  function renderLoginHistory(sessions) {
    var container = document.getElementById('loginTimeline');
    if (!container) return;

    var skeleton = document.getElementById('loginSkeleton');
    if (skeleton) skeleton.style.display = 'none';

    if (sessions.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="material-icons-round empty-state-icon">history</span><div class="empty-state-title">No login history</div><div class="empty-state-desc">No sessions found for the selected filters.</div></div>';
      return;
    }

    container.innerHTML = sessions.map(function(s, i) {
      var roleClass = (s.role === 'Admin' ? 'admin' : 'reception');
      var roleLabel = (s.role === 'Admin' ? 'AD' : 'RC');
      var statusClass = s.status;
      var statusLabel = s.status === 'logged_out' ? 'Logged Out' : s.status.charAt(0).toUpperCase() + s.status.slice(1);
      var duration = s.sessionDuration;
      if (!duration && s.loginTime && s.lastActivity && s.status !== 'active') {
        var lt = s.loginTime.toDate ? s.loginTime.toDate() : new Date(s.loginTime);
        var la = s.lastActivity.toDate ? s.lastActivity.toDate() : new Date(s.lastActivity);
        duration = la.getTime() - lt.getTime();
      }
      return '<div class="login-timeline-card" style="animation-delay:' + (i * 0.03) + 's">' +
        '<div class="lt-left">' +
          '<div class="lt-avatar ' + roleClass + '">' + roleLabel + '</div>' +
        '</div>' +
        '<div class="lt-body">' +
          '<div class="lt-user">' + esc(s.user || '—') + '</div>' +
          '<div class="lt-meta">' +
            '<span class="lt-meta-item"><span class="material-icons-round">badge</span><span class="role-badge ' + roleClass + '">' + esc(s.role || '—') + '</span></span>' +
            '<span class="lt-meta-item"><span class="material-icons-round">schedule</span>' + getRelativeTime(s.loginTime) + '</span>' +
            '<span class="lt-meta-item"><span class="material-icons-round">devices</span>' + esc(getDeviceShort(s.deviceInfo)) + '</span>' +
            (duration ? '<span class="lt-meta-item"><span class="material-icons-round">timelapse</span>' + formatDuration(duration) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="lt-right">' +
          '<span class="badge-status ' + statusClass + '">' + statusLabel + '</span>' +
          (s.status === 'active' ? '<button class="card-action-btn" onclick="forceLogoutSession(\'' + s.id + '\')" title="Force Logout" style="color:#D97706"><span class="material-icons-round">logout</span></button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  window.filterLoginHistory = function() {
    var q = (document.getElementById('loginSearch').value || '').toLowerCase();
    var roleFilter = document.getElementById('loginRoleFilter').value;
    var statusFilter = document.getElementById('loginStatusFilter').value;

    var filtered = allLoginSessions.filter(function(s) {
      if (q && (s.user || '').toLowerCase().indexOf(q) === -1 && (s.deviceInfo || '').toLowerCase().indexOf(q) === -1) return false;
      if (roleFilter && s.role !== roleFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      return true;
    });

    renderLoginHistory(filtered);
    updateLoginStats(filtered);
  };

  window.forceLogoutSession = function(sessionId) {
    if (!confirm('Force logout this session?')) return;
    window.FIREBASE_READY.then(function(db) {
      if (!db) { toast('Firebase not available', 'error'); return; }
      return db.collection('login_history').doc(sessionId).update({
        status: 'logged_out',
        lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
        sessionDuration: 0
      }).then(function() {
        toast('Session force-logged out', 'warning', 'logout');
      });
    }).catch(function(err) {
      toast('Failed to force logout: ' + err.message, 'error');
    });
  };

  window.forceLogoutAllSessions = function() {
    var active = allLoginSessions.filter(function(s) { return s.status === 'active'; });
    if (active.length === 0) { toast('No active sessions to logout', 'info'); return; }
    if (!confirm('Force logout all ' + active.length + ' active session(s)?')) return;

    var btn = document.getElementById('logoutAllBtn');
    if (btn) { setButtonLoading(btn, 'Logging out...'); }

    window.FIREBASE_READY.then(function(db) {
      if (!db) { toast('Firebase not available', 'error'); return; }
      var batch = db.batch();
      active.forEach(function(s) {
        var ref = db.collection('login_history').doc(s.id);
        batch.update(ref, { status: 'logged_out', lastActivity: firebase.firestore.FieldValue.serverTimestamp() });
      });
      return batch.commit().then(function() {
        toast(active.length + ' session(s) logged out', 'success', 'logout');
        if (btn) { setButtonIdle(btn); }
      });
    }).catch(function(err) {
      toast('Failed to logout all: ' + err.message, 'error');
      if (btn) { setButtonIdle(btn); }
    });
  };

  function loadLoginHistory() {
    if (loginHistoryUnsubscribe) { loginHistoryUnsubscribe(); loginHistoryUnsubscribe = null; }

    window.FIREBASE_READY.then(function(db) {
      if (!db) {
        document.getElementById('loginTimeline').innerHTML = '<div class="empty-state"><span class="material-icons-round empty-state-icon">error_outline</span><div class="empty-state-title">Firebase unavailable</div><div class="empty-state-desc">Login history requires Firebase.</div></div>';
        return;
      }

      loginHistoryUnsubscribe = db.collection('login_history')
        .limit(200)
        .onSnapshot(function(snapshot) {
          allLoginSessions = [];
          snapshot.forEach(function(doc) {
            var data = doc.data();
            data.id = doc.id;
            allLoginSessions.push(data);
          });
          allLoginSessions.sort(function(a, b) {
            var aTime = a.loginTime ? (a.loginTime.toDate ? a.loginTime.toDate().getTime() : new Date(a.loginTime).getTime()) : 0;
            var bTime = b.loginTime ? (b.loginTime.toDate ? b.loginTime.toDate().getTime() : new Date(b.loginTime).getTime()) : 0;
            return bTime - aTime;
          });
          var cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
          allLoginSessions = allLoginSessions.filter(function(s) {
            var t = s.loginTime ? (s.loginTime.toDate ? s.loginTime.toDate().getTime() : new Date(s.loginTime).getTime()) : 0;
            return t >= cutoff;
          });
          window.filterLoginHistory();
        }, function(err) {
          console.error('[Admin] Login history error:', err.message);
          document.getElementById('loginTimeline').innerHTML = '<div class="empty-state"><span class="material-icons-round empty-state-icon">error_outline</span><div class="empty-state-title">Failed to load</div><div class="empty-state-desc">' + esc(err.message) + '</div></div>';
        });
    });
  }

  /* ─── Announcements ─── */
  function loadAdminAnnouncements() {
    window.API.getMessages().then(function(resp) {
      var msgs = (resp && resp.data) || [];
      var active = msgs.filter(function(m) { return m.status === 'active' && (m.target === 'admin' || m.target === 'all' || !m.target); });
      var bar = document.getElementById('announcementsBar');
      var body = document.getElementById('adminAnnouncementsBody');
      if (!bar || !body) return;
      if (active.length === 0) { bar.style.display = 'none'; return; }
      bar.style.display = 'block';
      document.getElementById('adminAnnouncementsTitle').textContent = active.length === 1 ? '1 Announcement' : active.length + ' Announcements';
      body.innerHTML = active.sort(function(a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); }).map(function(m) {
        var date = m.createdAt ? new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        return '<div class="announcement-item"><h4>' + window.esc(m.title) + '</h4><p>' + window.esc(m.message) + '</p>' + (date ? '<div class="ann-date">' + date + '</div>' : '') + '</div>';
      }).join('');
    }).catch(function(err) {
      console.warn('[Admin] Failed to load announcements:', err);
    });
  }

  window.toggleAdminAnnouncements = function() {
    var body = document.getElementById('adminAnnouncementsBody');
    var icon = document.querySelector('#announcementsBar .toggle-icon');
    if (!body || !icon) return;
    var hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    icon.classList.toggle('collapsed', !hidden);
  };

  /* ─── Today's Patients & OPD ─── */
  function loadTodayPatients() {
    return window.API.getPatients().then(function(resp) {
      var list = (resp && resp.data) || [];
      var today = new Date();
      var todayStr = today.toISOString().slice(0, 10);
      var count = list.filter(function(p) {
        var d = p.created_on || p['Created On'] || '';
        if (!d) return false;
        d = String(d).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10) === todayStr;
        var dt = new Date(d);
        if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10) === todayStr;
        return false;
      }).length;
      animateValue(document.getElementById('statNewPatients'), count);
    }).catch(function(err) {
      console.warn('[Admin] Failed to load patients:', err);
    });
  }

  function loadTodayOPD() {
    return window.API.getAppointments().then(function(resp) {
      var list = (resp && resp.data) || [];
      var today = new Date();
      var todayStr = today.toISOString().slice(0, 10);
      var count = list.filter(function(a) {
        var date = a.appointment_date || a['Appointment Date'] || a.createdAt || a['Created At'] || '';
        date = String(date);
        return date.slice(0, 10) === todayStr;
      }).length;
      animateValue(document.getElementById('statOPDToday'), count);
    }).catch(function(err) {
      console.warn('[Admin] Failed to load OPD:', err);
    });
  }

  /* ─── Init ─── */
  function initAdmin() {
    if (typeof window.hideLoader === 'function') window.hideLoader();
    console.info('[Admin] Initializing admin panel...');

    if (!chartsInitialized && typeof Chart !== 'undefined') {
      Chart.register({
        id: 'barShadow',
        beforeDraw: function(chart) {
          if (chart.config.type !== 'bar') return;
          var ctx = chart.ctx;
          chart.data.datasets.forEach(function(ds, i) {
            var meta = chart.getDatasetMeta(i);
            if (!meta.hidden) {
              meta.data.forEach(function(bar) {
                if (bar && bar.x !== undefined) {
                  ctx.save();
                  ctx.shadowColor = 'rgba(13, 148, 136, 0.18)';
                  ctx.shadowBlur = 12;
                  ctx.shadowOffsetX = 0;
                  ctx.shadowOffsetY = 4;
                  ctx.fillStyle = 'transparent';
                  ctx.fillRect(bar.x - bar.width / 2, bar.y, bar.width, chart.chartArea.bottom - bar.y);
                  ctx.restore();
                }
              });
            }
          });
        }
      });
      Chart.register({
        id: 'centerText',
        beforeDraw: function(chart) {
          if (chart.config.type !== 'doughnut') return;
          var width = chart.width, height = chart.height, ctx = chart.ctx;
          ctx.restore();
          ctx.textBaseline = 'middle';
          var total = chart.data.datasets[0].data.reduce(function(a, b) { return a + b; }, 0);
          var text = total.toString();
          var textX = Math.round((width - ctx.measureText(text).width) / 2);
          var textY = height / 2;
          ctx.fillStyle = '#0f172a';
          ctx.font = '700 26px Manrope, sans-serif';
          ctx.fillText(text, textX, textY);
          ctx.font = '600 11px Inter, sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText('Total', textX, textY + 20);
          ctx.save();
        }
      });
      chartsInitialized = true;
    }

    var dateEl = document.getElementById('todayDate');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var greeting = document.getElementById('adminGreeting');
    if (greeting) {
      var hr = new Date().getHours();
      var greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
      greeting.textContent = greet + ', Admin';
    }

    // Network status
    function updateNetworkStatus() {
      var dot = document.getElementById('ssNetworkDot');
      var status = document.getElementById('ssNetworkStatus');
      if (dot && status) {
        dot.className = 'ss-dot ' + (navigator.onLine ? 'green' : 'red');
        status.textContent = navigator.onLine ? 'Online' : 'Offline';
      }
    }
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

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

    // Mobile search toggle
    var mobileSearchToggle = document.getElementById('mobileSearchToggle');
    var mobileSearchBar = document.getElementById('mobileSearchBar');
    if (mobileSearchToggle && mobileSearchBar) {
      mobileSearchToggle.addEventListener('click', function() {
        mobileSearchBar.classList.toggle('active');
        if (mobileSearchBar.classList.contains('active')) {
          document.getElementById('adminGlobalSearchMobile').focus();
        }
      });
    }

    Promise.all([loadDoctors(), loadDepartments(), loadTodayPatients(), loadTodayOPD()]).then(function() {
      populateDeptSelects();
      if (typeof window.populateAllDropdowns === 'function') window.populateAllDropdowns();
      console.info('[Admin] Data loaded successfully.');
    });

    loadAdminAnnouncements();
    loadLoginHistory();
  }

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
