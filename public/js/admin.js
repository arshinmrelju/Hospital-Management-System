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

  /* ─── Auth ─── */
  function adminLogin(code) {
    if (code === 'WMPAD01') {
      localStorage.setItem('hms_auth', JSON.stringify({
        code: 'WMPAD01', name: 'Admin', role: 'Admin', timestamp: Date.now()
      }));
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
      document.getElementById('doctorTableBody').innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--accent-red)">Failed to load doctors</td></tr>';
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
      document.getElementById('deptTableBody').innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--error)">Failed to load departments</td></tr>';
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
    // Also update the appointment form doctor dropdown if it exists
    var apptDoctor = document.getElementById('apptDoctor');
    if (apptDoctor) {
      apptDoctor.innerHTML = doctors.map(function(d) {
        return '<option value="' + esc(d.id) + '">' + esc(d.name) + ' (' + esc(d.dept) + ')</option>';
      }).join('');
    }
    // Update check-in doctor dropdown if exists
    var ciDoctor = document.getElementById('ciDoctor');
    if (ciDoctor) {
      ciDoctor.innerHTML = '<option value="" disabled selected>Select Doctor</option>' +
        doctors.map(function(d) {
          return '<option value="' + esc(d.id) + '">' + esc(d.name) + ' (' + esc(d.dept) + ')</option>';
        }).join('');
    }
  }

  /* ─── Render Doctors ─── */
  function renderDoctors() {
    var tbody = document.getElementById('doctorTableBody');
    if (!tbody) return;
    if (filteredDoctors.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--on-surface-var)">' +
        '<span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">local_hospital</span>No doctors found</td></tr>';
      return;
    }
    tbody.innerHTML = filteredDoctors.map(function(d) {
      var initials = d.initials || (d.name ? d.name.split(' ').map(function(n){return n[0]}).join('').slice(0,2) : 'DR');
      var statusClass = d.status || 'available';
      return '<tr>' +
        '<td><div class="doctor-cell"><div class="doctor-avatar-sm">' + esc(initials) + '</div><div><div style="font-weight:700">' + esc(d.name) + '</div><div style="font-size:0.72rem;color:var(--on-surface-var)">' + esc(d.id) + '</div></div></div></td>' +
        '<td style="font-size:0.82rem">' + esc(d.dept) + '</td>' +
        '<td style="font-size:0.82rem">' + esc(d.qualification || '—') + '</td>' +
        '<td style="font-size:0.82rem">' + esc(d.phone || d.email || '—') + '</td>' +
        '<td><span class="badge-status ' + statusClass + '">' + esc(statusClass) + '</span></td>' +
        '<td>' +
        '<button class="icon-btn" onclick="editDoctor(\'' + d.id + '\')" title="Edit"><span class="material-icons-round">edit</span></button> ' +
        '<button class="icon-btn danger" onclick="deleteDoctor(\'' + d.id + '\')" title="Delete"><span class="material-icons-round">delete</span></button>' +
        '</td></tr>';
    }).join('');
  }

  /* ─── Render Departments ─── */
  function renderDepartments() {
    var tbody = document.getElementById('deptTableBody');
    if (!tbody) return;
    if (filteredDepts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--on-surface-var)">' +
        '<span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">business</span>No departments found</td></tr>';
      return;
    }
    tbody.innerHTML = filteredDepts.map(function(d) {
      var statusClass = (d.status === 'active') ? 'available' : 'inactive';
      return '<tr>' +
        '<td><div style="font-weight:700">' + esc(d.name) + '</div><div style="font-size:0.72rem;color:var(--on-surface-var)">' + esc(d.id) + '</div></td>' +
        '<td style="font-size:0.82rem">' + esc(d.description || '—') + '</td>' +
        '<td><span class="badge-status ' + statusClass + '">' + esc(d.status || 'active') + '</span></td>' +
        '<td>' +
        '<button class="icon-btn" onclick="editDept(\'' + d.id + '\')" title="Edit"><span class="material-icons-round">edit</span></button> ' +
        '<button class="icon-btn danger" onclick="deleteDepartment(\'' + d.id + '\')" title="Delete"><span class="material-icons-round">delete</span></button>' +
        '</td></tr>';
    }).join('');
  }

  /* ─── Filters ─── */
  window.filterDoctors = function() {
    var q = (document.getElementById('doctorSearch').value || '').toLowerCase();
    filteredDoctors = doctors.filter(function(d) {
      return (d.name + ' ' + d.dept + ' ' + d.id + ' ' + (d.qualification || '')).toLowerCase().indexOf(q) !== -1;
    });
    renderDoctors();
  };

  window.filterDepartments = function() {
    var q = (document.getElementById('deptSearch').value || '').toLowerCase();
    filteredDepts = departments.filter(function(d) {
      return (d.name + ' ' + (d.description || '') + ' ' + d.id).toLowerCase().indexOf(q) !== -1;
    });
    renderDepartments();
  };

  /* ─── Stats ─── */
  function updateStats() {
    var totalDocs = doctors.length;
    var avail = doctors.filter(function(d) { return d.status === 'available'; }).length;
    var totalDepts = departments.length;
    var statDoctors = document.getElementById('statDoctors');
    var statAvail = document.getElementById('statAvailable');
    var statDepts = document.getElementById('statDepartments');
    if (statDoctors) statDoctors.textContent = totalDocs;
    if (statAvail) statAvail.textContent = avail;
    if (statDepts) statDepts.textContent = totalDepts;
    renderOverviewCharts();
  }

  /* ─── Overview Charts ─── */
  function renderOverviewCharts() {
    var deptCanvas = document.getElementById('deptChart');
    var statusCanvas = document.getElementById('statusChart');
    if (!deptCanvas || !statusCanvas) return;
    if (typeof Chart === 'undefined') return;

    // 1. Calculate Doctors per Department
    var deptCounts = {};
    departments.forEach(function(d) {
      deptCounts[d.name] = 0;
    });
    doctors.forEach(function(doc) {
      if (doc.dept) {
        deptCounts[doc.dept] = (deptCounts[doc.dept] || 0) + 1;
      }
    });

    var deptLabels = Object.keys(deptCounts);
    var deptData = Object.values(deptCounts);

    // 2. Calculate Doctor Status Distribution
    var statusCounts = { available: 0, busy: 0, off: 0 };
    doctors.forEach(function(doc) {
      var s = (doc.status || 'available').toLowerCase();
      if (s === 'off duty') s = 'off';
      if (statusCounts[s] !== undefined) {
        statusCounts[s]++;
      }
    });

    // 3. Render Department Chart (Bar Chart)
    if (deptChartInstance) {
      deptChartInstance.destroy();
    }
    deptChartInstance = new Chart(deptCanvas, {
      type: 'bar',
      data: {
        labels: deptLabels,
        datasets: [{
          label: 'Number of Doctors',
          data: deptData,
          backgroundColor: 'rgba(13, 148, 136, 0.15)', // Logo Teal soft
          borderColor: '#0D9488', // Logo Teal
          borderWidth: 2,
          borderRadius: 6,
          barThickness: 24
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              font: { family: 'Inter', size: 11, weight: '500' }
            },
            grid: { color: 'rgba(0, 0, 0, 0.04)' }
          },
          x: {
            ticks: {
              font: { family: 'Inter', size: 11, weight: '500' }
            },
            grid: { display: false }
          }
        }
      }
    });

    // 4. Render Status Chart (Doughnut Chart)
    if (statusChartInstance) {
      statusChartInstance.destroy();
    }
    statusChartInstance = new Chart(statusCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Available', 'Busy', 'Off Duty'],
        datasets: [{
          data: [statusCounts.available || 0, statusCounts.busy || 0, statusCounts.off || 0],
          backgroundColor: [
            'rgba(16, 185, 129, 0.15)', // Green soft
            'rgba(245, 158, 11, 0.15)', // Amber soft
            'rgba(107, 114, 128, 0.15)'  // Grey soft
          ],
          borderColor: [
            '#10B981', // Green
            '#F59E0B', // Amber
            '#6B7280'  // Grey
          ],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 10,
              padding: 15,
              font: { family: 'Inter', size: 11, weight: '600' }
            }
          }
        },
        cutout: '70%'
      }
    });
  }

  /* ─── Tab Switching ─── */
  window.switchAdminTab = function(tabId, btn) {
    document.querySelectorAll('.admin-tab-pane').forEach(function(p) { p.classList.remove('active'); });
    document.querySelectorAll('.admin-tab, .sidebar-nav .nav-item').forEach(function(i) { i.classList.remove('active'); });
    document.getElementById(tabId).classList.add('active');
    if (btn) btn.classList.add('active');
    var nav = document.getElementById('nav-' + tabId.replace('tab-', ''));
    if (nav) nav.classList.add('active');
  };

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
    btn.disabled = true; btn.textContent = 'Adding...';
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
      btn.disabled = false; btn.textContent = 'Add Doctor';
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
    btn.disabled = true; btn.textContent = 'Saving...';
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
      btn.disabled = false; btn.textContent = 'Save Changes';
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
    btn.disabled = true; btn.textContent = 'Adding...';
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
      btn.disabled = false; btn.textContent = 'Add Department';
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
    btn.disabled = true; btn.textContent = 'Saving...';
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
      btn.disabled = false; btn.textContent = 'Save Changes';
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

  /* ─── Init ─── */
  function initAdmin() {
    if (typeof window.hideLoader === 'function') window.hideLoader();
    console.info('[Admin] Initializing admin panel...');

    var dateEl = document.getElementById('todayDate');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    var greeting = document.getElementById('adminGreeting');
    if (greeting) {
      var hr = new Date().getHours();
      var greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
      greeting.textContent = greet + '! Manage doctors, departments, and system settings.';
    }

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
    Promise.all([loadDoctors(), loadDepartments()]).then(function() {
      populateDeptSelects();
      if (typeof window.populateAllDropdowns === 'function') window.populateAllDropdowns();
      console.info('[Admin] Data loaded successfully.');
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    // Wait for app.js to load
    var checkReady = setInterval(function() {
      if (typeof HMS !== 'undefined' && HMS && HMS.isAuthenticated) {
        clearInterval(checkReady);
        initLogin();
      }
    }, 50);
    setTimeout(function() { clearInterval(checkReady); }, 5000);
  });

})();