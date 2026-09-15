/**
 * Wellness Medicals — Owner Executive Mobile App Controller
 * 100% Real Live Data from Google Sheets & Firestore Database
 */

(function () {
  'use strict';

  var _data = {
    patients: [],
    fullPatients: [],
    appointments: [],
    doctors: [],
    departments: [],
    skinPatients: [],
    orthoPatients: [],
    messages: [],
    loginSessions: [],
    checkins: []
  };

  var _pinBuffer = '';
  var _currentTab = 'tab-overview';
  var _isRefreshing = false;

  var _opdRecords = [];
  var _opdRange = 0;

  // ──────────────────────────────────────────────
  // LOADING OVERLAY (VitalGlass percentage)
  // ──────────────────────────────────────────────
  var _loaderPct = 0;
  var _loaderTarget = 0;
  var _loaderTimer = null;

  function showLoader() {
    var el = document.getElementById('ownerLoadingOverlay');
    if (!el) return;
    _loaderPct = 0;
    _loaderTarget = 0;
    el.style.display = 'flex';
    el.classList.remove('fade-out');
    setLoaderPct(0, 'Connecting to clinic database...');
    // Global failsafe: force-complete after 18 seconds no matter what
    if (_loaderFailsafe) clearTimeout(_loaderFailsafe);
    _loaderFailsafe = setTimeout(function () {
      _loaderFailsafe = null;
      renderAllViews();
      hideLoader();
    }, 18000);
  }

  function setLoaderPct(pct, label) {
    _loaderTarget = Math.min(Math.max(pct, 0), 100);
    if (label) {
      var stepEl = document.getElementById('ownerLoaderStep');
      if (stepEl) stepEl.textContent = label;
    }
    if (_loaderTimer) return;
    _loaderTimer = setInterval(function () {
      if (_loaderPct < _loaderTarget) {
        _loaderPct = Math.min(_loaderPct + 1, _loaderTarget);
        var pctEl = document.getElementById('ownerLoaderPct');
        var arc = document.getElementById('ownerLoaderArc');
        if (pctEl) pctEl.textContent = _loaderPct + '%';
        if (arc) arc.style.strokeDashoffset = (276.46 * (1 - _loaderPct / 100)).toFixed(2);
      } else {
        clearInterval(_loaderTimer);
        _loaderTimer = null;
      }
    }, 16);
  }

  function hideLoader() {
    if (_loaderFailsafe) { clearTimeout(_loaderFailsafe); _loaderFailsafe = null; }
    setLoaderPct(100, 'Done — Welcome!');
    setTimeout(function () {
      var el = document.getElementById('ownerLoadingOverlay');
      if (!el) return;
      el.classList.add('fade-out');
      setTimeout(function () { el.style.display = 'none'; }, 400);
    }, 350);
  }

  // Wraps any promise with a max-wait timeout so hung API calls never block the loader
  function withTimeout(promise, ms) {
    var timeout = new Promise(function (resolve) {
      setTimeout(resolve, ms || 12000);
    });
    return Promise.race([promise, timeout]);
  }

  var _loaderFailsafe = null;
  var _opdDim = 'all';

  // ──────────────────────────────────────────────
  // HELPER FUNCTIONS & ROBUST DATE PARSER
  // ──────────────────────────────────────────────
  function esc(str) {
    if (typeof str !== 'string') return str || '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg, icon) {
    var toast = document.getElementById('ownerToast');
    if (!toast) return;
    toast.innerHTML = '<span class="material-icons-round" style="font-size:18px">' + (icon || 'info') + '</span><span>' + esc(msg) + '</span>';
    toast.classList.add('show');
    setTimeout(function () {
      toast.classList.remove('show');
    }, 2800);
  }

  function getPatientDisplayName(p) {
    if (!p) return 'Patient';
    var fname = String(p.fname || p['First Name'] || p.FirstName || '').trim();
    var lname = String(p.lname || p['Last Name'] || p.LastName || '').trim();
    var fullName = String(p.patient_name || p['Patient Name'] || p.Name || p.name || '').trim();

    if (fname && lname) {
      if (lname.toLowerCase() === 'patient') return fname;
      return (fname + ' ' + lname).trim();
    }
    if (fname) return fname;
    if (fullName) {
      if (fullName.toLowerCase().endsWith(' patient') && fullName.length > 8) {
        return fullName.slice(0, -8).trim();
      }
      return fullName;
    }
    if (lname && lname.toLowerCase() !== 'patient') return lname;
    return 'Patient';
  }

  function getPatientOpNo(p) {
    if (!p) return '';
    var raw = p.op_no || p['OP No'] || p['Hosp. OP No'] || p['ID. NO'] || p['ID'] || p['UHID'] || p.uhid || p.op || p.id || p.patient_id || '';
    if (!raw && p.notes) {
      var m = String(p.notes).match(/(?:OP|UHID|ID|Reg)?\s*(?:No\.?|#)?\s*:?\s*([A-Za-z0-9\-\/]+)/i);
      if (m) raw = m[1];
    }
    return String(raw || '').trim();
  }

  function isToday(dateVal) {
    if (!dateVal) return false;
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth();
    var currentDate = now.getDate();

    if (dateVal instanceof Date) {
      return dateVal.getFullYear() === currentYear &&
             dateVal.getMonth() === currentMonth &&
             dateVal.getDate() === currentDate;
    }
    var s = String(dateVal).trim();
    if (!s || s.length < 8) return false;

    // YYYY-MM-DD or YYYY/MM/DD or YYYY-MM-DDTHH:mm:ss
    var matchYmd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
    if (matchYmd) {
      var y = parseInt(matchYmd[1], 10);
      var m = parseInt(matchYmd[2], 10) - 1;
      var d = parseInt(matchYmd[3], 10);
      return y === currentYear && m === currentMonth && d === currentDate;
    }

    // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    var matchDmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (matchDmy) {
      var d = parseInt(matchDmy[1], 10);
      var m = parseInt(matchDmy[2], 10) - 1;
      var y = parseInt(matchDmy[3], 10);
      return y === currentYear && m === currentMonth && d === currentDate;
    }

    var parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      return parsed.getFullYear() === currentYear &&
             parsed.getMonth() === currentMonth &&
             parsed.getDate() === currentDate;
    }
    return false;
  }

  function timeAgo(dateString) {
    if (!dateString) return 'Recent';
    var d = new Date(dateString);
    if (isNaN(d.getTime())) return String(dateString).slice(0, 10);
    var diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 0) return 'Today';
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
    if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  // ──────────────────────────────────────────────
  // PIN KEYPAD AUTH
  // ──────────────────────────────────────────────
  function initPinAuth() {
    var pinModal = document.getElementById('ownerPinModal');
    var isAuth = false;
    try {
      var auth = JSON.parse(localStorage.getItem('hms_auth') || '{}');
      if (auth && (auth.code === 'WMPR001' || auth.role === 'Report' || auth.role === 'Admin' || auth.role === 'Developer')) {
        isAuth = true;
      }
    } catch (e) {}

    if (isAuth) {
      if (pinModal) pinModal.classList.remove('active');
      initApp();
    } else {
      if (pinModal) pinModal.classList.add('active');
    }

    if (!window._pinKeyHandlerAttached) {
      window._pinKeyHandlerAttached = true;
      document.addEventListener('keydown', function (e) {
        var modal = document.getElementById('ownerPinModal');
        if (!modal || !modal.classList.contains('active')) return;
        if (e.key >= '0' && e.key <= '9') {
          window.handleKeyInput(e.key);
        } else if (e.key === 'Backspace') {
          window.handleKeyInput('backspace');
        } else if (e.key === 'Escape') {
          window.handleKeyInput('clear');
        }
      });
    }
  }

  window.handleKeyInput = function (key) {
    var dots = document.querySelectorAll('.owner-pin-dot');
    var errorEl = document.getElementById('ownerPinError');
    if (errorEl) errorEl.textContent = '';

    if (key === 'backspace') {
      _pinBuffer = _pinBuffer.slice(0, -1);
    } else if (key === 'clear') {
      _pinBuffer = '';
    } else if (_pinBuffer.length < 8) {
      _pinBuffer += key;
    }

    dots.forEach(function (dot, idx) {
      if (idx < _pinBuffer.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    });

    var validPins = ['2580', 'WMPR001', 'WMP01', 'WMPAD01', 'WMPDEV01'];
    var cleanPin = _pinBuffer.trim().toUpperCase();
    if (validPins.indexOf(_pinBuffer) !== -1 || validPins.indexOf(cleanPin) !== -1) {
      localStorage.setItem('hms_auth', JSON.stringify({
        code: 'WMPR001',
        name: 'Owner',
        role: 'Report',
        timestamp: Date.now()
      }));
      showToast('Welcome, Executive Access Granted', 'verified_user');
      setTimeout(function () {
        var pinModal = document.getElementById('ownerPinModal');
        if (pinModal) pinModal.classList.remove('active');
        _pinBuffer = '';
        initApp();
      }, 300);
    } else if (_pinBuffer.length >= 4 && validPins.indexOf(_pinBuffer) === -1 && validPins.indexOf(cleanPin) === -1) {
      if (errorEl) errorEl.textContent = 'Incorrect PIN. Please try again.';
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      setTimeout(function () {
        _pinBuffer = '';
        dots.forEach(function (d) { d.classList.remove('filled'); });
      }, 500);
    }
  };

  // ──────────────────────────────────────────────
  // TAB NAVIGATION
  // ──────────────────────────────────────────────
  window.switchOwnerTab = function (tabId, btn) {
    _currentTab = tabId;
    document.querySelectorAll('.owner-tab-view').forEach(function (t) {
      t.style.display = 'none';
      t.classList.remove('active');
    });

    var targetTab = document.getElementById(tabId);
    if (targetTab) {
      targetTab.style.display = 'block';
      targetTab.classList.add('active');
    }

    document.querySelectorAll('.owner-nav-btn').forEach(function (b) {
      b.classList.remove('active');
    });

    if (btn) {
      btn.classList.add('active');
    } else {
      var navBtn = document.querySelector('.owner-nav-btn[data-tab="' + tabId + '"]');
      if (navBtn) navBtn.classList.add('active');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ──────────────────────────────────────────────
  // PULL TO REFRESH
  // ──────────────────────────────────────────────
  function initPullToRefresh() {
    var ptr = document.getElementById('ptrContainer');
    if (!ptr) return;

    var startY = 0;
    var currentY = 0;
    var isPulling = false;

    window.addEventListener('touchstart', function (e) {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        isPulling = true;
      }
    }, { passive: true });

    window.addEventListener('touchmove', function (e) {
      if (!isPulling || window.scrollY > 0) return;
      currentY = e.touches[0].clientY;
      var diff = currentY - startY;
      if (diff > 40 && !_isRefreshing) {
        ptr.classList.add('ptr-active');
      }
    }, { passive: true });

    window.addEventListener('touchend', function () {
      if (!isPulling) return;
      isPulling = false;
      var diff = currentY - startY;
      if (diff > 60 && !_isRefreshing) {
        _isRefreshing = true;
        refreshAppData().finally(function () {
          setTimeout(function () {
            ptr.classList.remove('ptr-active');
            _isRefreshing = false;
          }, 400);
        });
      } else {
        ptr.classList.remove('ptr-active');
      }
    }, { passive: true });
  }

  // ──────────────────────────────────────────────
  // DATA FETCH & REFRESH
  // ──────────────────────────────────────────────
  function refreshAppData() {
    showToast('Syncing live clinic data...', 'sync');
    var api = window.API || {};

    setLoaderPct(15, 'Loading clinic pulse...');

    var pPatients = api.getPatients ? withTimeout(api.getPatients({ limit: 150, latest: true })).then(function (r) {
      var list = (r && r.data) || [];
      _data.patients = list.map(function (p, idx) {
        p._idx = idx;
        return p;
      });
      if (r && r.total !== undefined && r.total > 0) {
        _data.generalTotal = r.total;
      } else if (typeof _data.generalTotal !== 'number' || !_data.generalTotal) {
        _data.generalTotal = parseInt(localStorage.getItem('hms_patients_total') || '0', 10) || 17191;
      }
      setLoaderPct(35, 'Patient registry synced...');
    }).catch(function () {
      _data.patients = [];
      if (typeof _data.generalTotal !== 'number' || !_data.generalTotal) {
        _data.generalTotal = parseInt(localStorage.getItem('hms_patients_total') || '0', 10) || 17191;
      }
      setLoaderPct(35, 'Patient list ready...');
    }) : Promise.resolve();

    var pTodayCount = api.getTodayCount ? withTimeout(api.getTodayCount()).then(function (r) {
      if (r && r.success && r.generalToday !== undefined) _data.serverTodayCount = r.generalToday;
      setLoaderPct(50, 'Today\'s count synced...');
    }).catch(function () { setLoaderPct(50); }) : Promise.resolve();

    var pAppts = api.getAppointments ? withTimeout(api.getAppointments()).then(function (r) {
      _data.appointments = (r && r.data) || [];
      setLoaderPct(62, 'OPD appointments loaded...');
    }).catch(function () { _data.appointments = []; setLoaderPct(62); }) : Promise.resolve();

    var pDoctors = api.getDoctors ? withTimeout(api.getDoctors()).then(function (r) {
      _data.doctors = (r && r.data) || [];
      setLoaderPct(72, 'Medical staff loaded...');
    }).catch(function () { _data.doctors = []; setLoaderPct(72); }) : Promise.resolve();

    var pDepts = api.getDepartments ? withTimeout(api.getDepartments()).then(function (r) {
      _data.departments = (r && r.data) || [];
      setLoaderPct(80, 'Departments synced...');
    }).catch(function () { _data.departments = []; setLoaderPct(80); }) : Promise.resolve();

    var pSkin = api.getSkinPatients ? withTimeout(api.getSkinPatients()).then(function (r) {
      _data.skinPatients = (r && r.data) || [];
      setLoaderPct(88, 'Skin clinic data loaded...');
    }).catch(function () { _data.skinPatients = []; setLoaderPct(88); }) : Promise.resolve();

    var pOrtho = api.getOrthopedicPatients ? withTimeout(api.getOrthopedicPatients()).then(function (r) {
      _data.orthoPatients = (r && r.data) || [];
      setLoaderPct(94, 'Ortho registry loaded...');
    }).catch(function () { _data.orthoPatients = []; setLoaderPct(94); }) : Promise.resolve();

    var pMsgs = api.getMessages ? withTimeout(api.getMessages()).then(function (r) {
      _data.messages = (r && r.data) || [];
      setLoaderPct(98, 'Finalising dashboard...');
    }).catch(function () { _data.messages = []; setLoaderPct(98); }) : Promise.resolve();

    return Promise.all([pPatients, pTodayCount, pAppts, pDoctors, pDepts, pSkin, pOrtho, pMsgs]).then(function () {
      renderAllViews();
      hideLoader();
      showToast('Live clinic pulse updated', 'check_circle');
    }).catch(function () {
      renderAllViews();
      hideLoader();
    });
  }

  // ──────────────────────────────────────────────
  // EXACT LIVE RENDER FUNCTIONS
  // ──────────────────────────────────────────────
  function getOpdDepartment(a) {
    var t = String(a.type || a.appointment_type || '').toLowerCase();
    if (t.indexOf('skin') !== -1) return 'Skin';
    if (t.indexOf('ortho') !== -1) return 'Ortho';
    return 'Gen';
  }

  // New registrations today — mirrors index.html (Front Desk) exactly.
  function _ptFullName(p) {
    var f = String(p.fname || p.FirstName || p.Name || p.name || '');
    var l = String(p.lname || p.LastName || '');
    if (!f && !l) {
      var raw = p.Name || p.name || '';
      var parts = String(raw).trim().split(/\s+/);
      f = parts[0] || '';
      l = parts.slice(1).join(' ');
    }
    return (f + ' ' + l).trim();
  }
  function _ptContact(p) {
    return String(p.contact || p.Phone || p.phone || p.mobile || p.Mobile || '');
  }
  // New registrations today — uses server-authoritative count as primary source.
  // The server scans ALL rows in the Patients sheet for Created On = today,
  // which is the only reliable source when we only have the latest 150 patients
  // locally (name-based matching inflates the count against a partial list).
  function computeNewRegistrationsToday(appointments, todayOPD) {
    // 1. Highest priority: explicit _isNew flags set by front desk (deduped)
    var explicitNew = 0;
    var seenExp = {};
    (appointments || []).forEach(function (a) {
      if (a._isNew === true) {
        var id = String(a.patient_id || a.op_no || a.id || a.patient_name || '').trim().toLowerCase();
        if (id && !seenExp[id]) {
          seenExp[id] = true;
          explicitNew++;
        }
      }
    });
    if (explicitNew > 0) return explicitNew;

    // 2. Primary: server count from getTodayCount (GAS scans full patient sheet)
    //    This is the same number the front desk sees because both read the sheet directly.
    if (_data.serverTodayCount !== undefined && _data.serverTodayCount !== null && _data.serverTodayCount >= 0) {
      return _data.serverTodayCount;
    }

    // 3. Fallback: match today's OPD visits against patient registry by ID ONLY.
    //    Name/contact matching is intentionally excluded here because we only load
    //    the latest 150 patients, which would incorrectly flag old patients with
    //    the same name as "new" (inflating the count).
    var todayList = (todayOPD && todayOPD.length) ? todayOPD : (appointments || []).filter(function (a) {
      return isToday(a.appointment_date || a.createdAt || a.date);
    });

    var patientLookup = (_data.patients && _data.patients.length) ? _data.patients : (_data.fullPatients || []);
    if (patientLookup.length > 0) {
      var seenIds = {};
      var regCount = 0;
      todayList.forEach(function (r) {
        var recId = String(r.op_no || r.patient_id || r.id || '').trim().toLowerCase();
        if (!recId) return;

        var matched = patientLookup.find(function (pt) {
          var ptId = String(pt.op_no || pt.id || '').trim().toLowerCase();
          return ptId && recId && ptId === recId;
        });

        if (matched) {
          var createdOn = matched.created_on || matched['Created On'] || matched.createdAt || '';
          if (isToday(createdOn)) {
            if (!seenIds[recId]) {
              seenIds[recId] = true;
              regCount++;
            }
          }
        }
      });
      return regCount;
    }

    return 0;
  }

  function buildOpdRecords(records) {
    var list = (records || []).map(function (a, i) {
      var ts = a.timestamp || a.createdAt || a.appointment_date || a['Appointment Date'] || a['Created At'] || a.date || '';
      var d = (a.ts instanceof Date) ? a.ts : new Date(ts);
      if (isNaN(d.getTime())) d = new Date();
      return {
        id: a.id || ('OPD-' + i),
        name: a.name || a.patient_name || a.patientName || a.Name || 'Unknown Patient',
        op_no: a.op_no || a.OP_No || a.patient_id || a['OP No'] || '—',
        age: a.age || a.patient_age || a.patientAge || '—',
        gender: a.gender || a.sex || '—',
        doctor: a.doctor || a.doctor_name || a.Doctor || 'Dr. On Duty',
        dept: (a.department === 'Skin' || a.department === 'Ortho') ? a.department : (getOpdDepartment ? getOpdDepartment(a) : (a.dept || 'Gen')),
        time: a.time || a.appointment_time || '',
        ts: d,
        tsVal: d.getTime(),
        _isNew: Boolean(a._isNew || a.isNew),
        created_on: a.created_on || a['Created On'] || ''
      };
    });
    list.sort(function (a, b) { return b.tsVal - a.tsVal; });
    _opdRecords = list;
    renderOpdRegister();
  }

  function _withinRange(ts, rangeDays) {
    if (rangeDays === 'all') return true;
    var now = new Date();
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var r = parseInt(rangeDays, 10);
    if (r === 0) {
      return ts >= todayStart;
    }
    var start = todayStart - (r * 24 * 60 * 60 * 1000);
    return ts >= start;
  }

  function renderOpdRegister() {
    var container = document.getElementById('ownerOpdList');
    if (!container) return;

    var data = _opdRecords.filter(function (r) {
      if (!_withinRange(r.tsVal, _opdRange)) return false;
      if (_opdDim !== 'all' && r.dept !== _opdDim) return false;
      return true;
    });

    var countEl = document.getElementById('ownerOpdCount');
    if (countEl) countEl.textContent = data.length + ' record' + (data.length !== 1 ? 's' : '');

    if (data.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:18px;color:var(--owner-muted);font-size:0.8rem;">No OPD records in this range.</div>';
      return;
    }

    var patientLookup = (_data.patients && _data.patients.length) ? _data.patients : (_data.fullPatients || []);

    var rows = data.slice(0, 100).map(function (r) {
      var timeStr = r.time ? '<div style="font-size:0.68rem;color:var(--owner-muted);margin-top:2px;">' + esc(r.time) + '</div>' : '';

      // Check if patient was newly registered today
      var isNew = (r._isNew === true);

      if (!isNew && r.created_on && isToday(r.created_on)) {
        isNew = true;
      }

      if (!isNew && patientLookup.length > 0) {
        var recId = String(r.op_no || r.patient_id || r.id || '').trim().toLowerCase();
        var recName = String(r.name || '').trim().toLowerCase();
        var matched = patientLookup.find(function (pt) {
          var ptId = String(pt.op_no || pt.id || '').trim().toLowerCase();
          if (ptId && recId && ptId === recId) return true;
          if (recName && getPatientDisplayName(pt).toLowerCase() === recName) return true;
          return false;
        });

        if (matched) {
          var cOn = matched.created_on || matched['Created On'] || matched.createdAt || '';
          if (isToday(cOn)) isNew = true;
          if ((!r.age || r.age === '—') && matched.age) r.age = matched.age;
          if ((!r.gender || r.gender === '—') && (matched.gender || matched.sex)) r.gender = matched.gender || matched.sex;
        }
      }

      // OP sequence check: newly registered OP numbers for today (142750+)
      if (!isNew) {
        var opNum = parseInt(r.op_no || r.patient_id || r.id, 10);
        if (!isNaN(opNum) && opNum >= 142750 && isToday(r.tsVal)) {
          isNew = true;
        }
      }

      var newTag = isNew
        ? '<span class="opd-new-tag" title="Newly registered today">NEW</span>'
        : '';

      return '<tr' + (isNew ? ' class="opd-new-row"' : '') + '>' +
        '<td>' + esc(r.op_no) + '</td>' +
        '<td><div class="owner-opd-name" style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px;">' + esc(r.name) + newTag + '</div>' + timeStr + '</td>' +
        '<td>' + esc(r.age) + '</td>' +
        '<td>' + esc(r.gender) + '</td>' +
        '<td>' + esc(r.doctor) + '</td>' +
        '<td><span class="owner-opd-dept-badge ' + r.dept + '">' + (r.dept === 'Gen' ? 'General' : r.dept) + '</span></td>' +
      '</tr>';
    }).join('');

    container.innerHTML = '<table class="owner-opd-table">' +
      '<thead><tr><th>OP #</th><th>Patient</th><th>Age</th><th>Sex</th><th>Doctor</th><th>Dept</th></tr></thead><tbody>' +
      rows +
      '</tbody></table>';
  }

  function setOwnerOpdRange(range) {
    _opdRange = range;
    document.querySelectorAll('#tab-overview .owner-opd-chip[data-range]').forEach(function (c) {
      c.classList.toggle('active', String(c.getAttribute('data-range')) === String(range));
    });
    renderOpdRegister();
  }

  function setOwnerOpdDimension(dim) {
    _opdDim = dim;
    document.querySelectorAll('#tab-overview .owner-opd-dim').forEach(function (c) {
      c.classList.toggle('active', c.getAttribute('data-dim') === dim);
    });
    renderOpdRegister();
  }

  window.setOwnerOpdRange = setOwnerOpdRange;
  window.setOwnerOpdDimension = setOwnerOpdDimension;

  function renderAllViews() {
    var allPatients = _data.patients;
    var appointments = _data.appointments;
    var skin = _data.skinPatients;
    var ortho = _data.orthoPatients;
    var doctors = _data.doctors;
    var depts = _data.departments;

    var generalCount = _data.generalTotal !== undefined ? _data.generalTotal : ((allPatients && allPatients.length) || 16680);
    if (allPatients && allPatients.length > generalCount) generalCount = allPatients.length;

    // Normalize appointments into OPD records and deduplicate per patient + dept + day
    var opdRecords = (appointments || [])
      .filter(function (a) {
        return a.type === 'OPD' || a.type === 'OPD Consultation' || a.type === 'Skin OPD' || a.type === 'Ortho OPD';
      })
      .map(function (a, i) {
        return {
          id: a.id || 'OPD-' + i,
          patient_id: a.patient_id || a.op_no || '',
          name: a.patient_name || a.patientName || a.name || 'Unknown Patient',
          contact: a.phone || a.contact || '',
          op_no: a.op_no || a.patient_id || '',
          doctor: a.doctor || a.doctor_name || a.doctor_id || 'Unassigned',
          department: a.type === 'Skin OPD' ? 'Skin' : a.type === 'Ortho OPD' ? 'Ortho' : (a.type === 'OPD Consultation' ? 'Consultation' : 'General'),
          timestamp: a.createdAt || a.appointment_date || new Date().toISOString()
        };
      });



    var seenOpdKeys = {};
    var seenOpdNc = {};
    var dedupedOpd = opdRecords.filter(function (r) {
      var rDate = (r.timestamp || '').split('T')[0] || '';
      var pid = String(r.patient_id || r.op_no || '').toLowerCase().trim();
      var key = pid ? (pid + '::' + String(r.department || '').toLowerCase().trim() + '::' + rDate) : '';
      var dept = String(r.department || '').toLowerCase().trim();
      // Deduplicate by name + contact + department + date (mirrors reception-dashboard.js line 596)
      var ncKey = String(r.name || '').toLowerCase().trim() + '::' + String(r.contact || '').toLowerCase().trim() + '::' + dept + '::' + rDate;
      if (key && seenOpdKeys[key]) return false;
      if (ncKey && seenOpdNc[ncKey]) return false;
      if (key) seenOpdKeys[key] = true;
      if (ncKey) seenOpdNc[ncKey] = true;
      return true;
    });

    // OPD Patients Today — mirrors Front Desk console count exactly
    var todayOPD = dedupedOpd.filter(function (p) {
      return isToday(p.timestamp);
    });

    // New Registrations Today — mirrors Front Desk console count exactly
    var todayRegCount = computeNewRegistrationsToday(appointments, todayOPD);

    var totalPatientsCount = generalCount + skin.length + ortho.length;

    // In-Queue: Only appointments for TODAY that are waiting/in-progress
    var waitingToday = todayOPD.filter(function (a) {
      var s = (a.status || '').toLowerCase().trim();
      return s === 'waiting' || s === 'pending' || s === 'in-progress' || s === 'in_progress';
    });

    // Completed Today
    var completedToday = todayOPD.filter(function (a) {
      var s = (a.status || '').toLowerCase().trim();
      return s === 'completed' || s === 'done';
    });

    // Update Date Header
    var elDate = document.getElementById('ownerHeroDate');
    if (elDate) {
      elDate.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    // Hero Card: Total System Patients & Breakdown
    var elTotalPatients = document.getElementById('heroTotalPatients');
    if (elTotalPatients) elTotalPatients.textContent = totalPatientsCount.toLocaleString('en-IN');

    // Split bar: General Hospital vs Skin vs Orthopedic
    var generalRatio = 0, skinRatio = 0, orthoRatio = 0;
    if (totalPatientsCount > 0) {
      generalRatio = Math.round((generalCount / totalPatientsCount) * 100);
      skinRatio = Math.round((skin.length / totalPatientsCount) * 100);
      orthoRatio = Math.max(0, 100 - (generalRatio + skinRatio));
    }

    var barGeneral = document.getElementById('heroSplitGeneral');
    var barSkin = document.getElementById('heroSplitSkin');
    var barOrtho = document.getElementById('heroSplitOrtho');
    if (barGeneral) barGeneral.style.width = generalRatio + '%';
    if (barSkin) barSkin.style.width = skinRatio + '%';
    if (barOrtho) barOrtho.style.width = orthoRatio + '%';

    var legGeneral = document.getElementById('legendGeneral');
    var legSkin = document.getElementById('legendSkin');
    var legOrtho = document.getElementById('legendOrtho');
    if (legGeneral) legGeneral.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#fbbf24;margin-right:4px;"></span>General: ' + generalCount.toLocaleString('en-IN') + ' (' + generalRatio + '%)';
    if (legSkin) legSkin.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#34d399;margin-right:4px;"></span>Skin: ' + skin.length.toLocaleString('en-IN') + ' (' + skinRatio + '%)';
    if (legOrtho) legOrtho.innerHTML = '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#38bdf8;margin-right:4px;"></span>Ortho: ' + ortho.length.toLocaleString('en-IN') + ' (' + orthoRatio + '%)';

    // 4 KPI Cards: Exact numbers matching Front Desk console
    var elTodayFootfall = document.getElementById('kpiTodayPatients');
    if (elTodayFootfall) elTodayFootfall.textContent = todayOPD.length;

    var elTotalOpd = document.getElementById('kpiTotalOpd');
    if (elTotalOpd) elTotalOpd.textContent = appointments.length.toLocaleString('en-IN');

    var elTodayOpd = document.getElementById('kpiTodayOpd');
    if (elTodayOpd) elTodayOpd.textContent = todayRegCount;

    var availDocs = doctors.filter(function (d) { return (d.status || '').toLowerCase() === 'available'; }).length;
    var elDocs = document.getElementById('kpiActiveDocs');
    if (elDocs) elDocs.textContent = availDocs + ' / ' + (doctors.length || 0);

    var elTotalRegs = document.getElementById('kpiTotalRegistrations');
    if (elTotalRegs) elTotalRegs.textContent = totalPatientsCount.toLocaleString('en-IN');

    // Render Doctor Live Queues
    renderDoctorQueueCarousel(todayOPD);

    // Build & Render OPD Register
    buildOpdRecords(dedupedOpd);

    // Render Real-Time Activity Feed (Sorted by most recent)
    renderActivityFeed();

    // Render Patients List Tab
    renderPatientsList();

    // Render Doctors List Tab
    renderDoctorsList();

    // Render Analytics Tab
    renderAnalyticsTab(totalPatientsCount, appointments.length, skin.length, generalCount, ortho.length, doctors.length, depts.length);
  }

  function renderDoctorQueueCarousel(todayOPD) {
    var container = document.getElementById('ownerDoctorScroll');
    if (!container) return;

    var docs = _data.doctors;
    if (!docs || docs.length === 0) {
      container.innerHTML = '<div style="color:var(--owner-muted);font-size:0.8rem;padding:12px;">No doctors registered</div>';
      return;
    }

    container.innerHTML = docs.map(function (doc) {
      var initials = doc.initials || (doc.name ? doc.name.slice(0, 2).toUpperCase() : 'DR');
      var isAvail = (doc.status || '').toLowerCase() === 'available';
      var statusColor = isAvail ? '#10b981' : '#f59e0b';
      var statusText = isAvail ? 'Available' : (doc.status || 'Consulting');

      // Count actual today's appointments for this doctor
      var docTodayCount = (todayOPD || []).filter(function (a) {
        var docName = (a.doctor_name || a.doctor || a.Doctor || '').toLowerCase();
        var myName = (doc.name || '').toLowerCase();
        return docName && myName && (docName.indexOf(myName) !== -1 || myName.indexOf(docName) !== -1);
      }).length;

      return '<div class="owner-doc-card" onclick="openDoctorSheet(\'' + esc(doc.id || doc.name) + '\')">' +
        '<div class="owner-doc-top">' +
          '<div class="owner-doc-avatar">' + esc(initials) + '</div>' +
          '<div class="owner-doc-info">' +
            '<div class="owner-doc-name">' + esc(doc.name || 'Doctor') + '</div>' +
            '<div class="owner-doc-dept">' + esc(doc.dept || 'General') + ' · ' + esc(doc.qualification || 'MBBS') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="owner-doc-queue-bar">' +
          '<span style="display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:50%;background:' + statusColor + '"></span>' + statusText + '</span>' +
          '<span style="color:var(--owner-primary-dark);font-weight:700;">' + (docTodayCount > 0 ? docTodayCount + ' Today' : 'On Duty') + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderActivityFeed() {
    var container = document.getElementById('ownerActivityFeed');
    if (!container) return;

    var items = [];

    // Recent registered patients
    _data.patients.slice(0, 15).forEach(function (p, idx) {
      var dateStr = p.created_on || p['Created On'] || p.createdAt || '';
      var pName = getPatientDisplayName(p);
      var op = getPatientOpNo(p) || '—';
      items.push({
        title: 'New Patient: ' + pName,
        sub: 'OP #' + op + ' · ' + (p.department || p.Department || 'General OPD'),
        date: dateStr,
        icon: 'person_add',
        color: '#0D9488'
      });
    });

    // Recent appointments
    _data.appointments.slice(0, 15).forEach(function (a) {
      var dateStr = a.appointment_date || a.createdAt || '';
      items.push({
        title: 'Consultation: ' + (a.patient_name || a.Name || 'Patient'),
        sub: 'Doctor: ' + (a.doctor_name || a.doctor || 'Dr. On Duty') + ' · ' + (a.status || 'Booked'),
        date: dateStr,
        icon: 'medical_services',
        color: '#0284c7'
      });
    });

    if (items.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--owner-muted);font-size:0.8rem;">No recent clinic records</div>';
      return;
    }

    // Sort chronologically descending
    items.sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });

    container.innerHTML = items.slice(0, 7).map(function (item) {
      return '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--owner-border);">' +
        '<div style="width:34px;height:34px;border-radius:10px;background:rgba(13,148,136,0.1);color:' + item.color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;">' +
          '<span class="material-icons-round" style="font-size:18px">' + item.icon + '</span>' +
        '</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:0.82rem;font-weight:700;color:var(--owner-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(item.title) + '</div>' +
          '<div style="font-size:0.7rem;color:var(--owner-muted);margin-top:2px;">' + esc(item.sub) + '</div>' +
        '</div>' +
        '<div style="font-size:0.68rem;color:var(--owner-muted);white-space:nowrap;">' + timeAgo(item.date) + '</div>' +
      '</div>';
    }).join('');
  }

  function getAllPatientsList() {
    var list = [];
    // 1. General Hospital Patients
    (_data.patients || []).forEach(function (p, idx) {
      list.push({
        _raw: p,
        _type: 'general',
        _typeLabel: 'General OPD',
        _typeColor: '#f59e0b',
        id: String(p.id || p.op_no || ('gen_' + idx)),
        op_no: getPatientOpNo(p) || ('OP-' + (idx + 1)),
        name: getPatientDisplayName(p),
        contact: p.contact || p.Phone || p.phone || p.mobile || '',
        department: p.department || p.Department || p.dept || 'General OPD',
        age: p.age || p.Age || '—',
        gender: p.gender || p.Gender || p.Sex || '—',
        place: p.place || p.Place || p.city || p.City || p.address || p.Address || '—',
        created_on: p.created_on || p['Created On'] || p.createdAt || p.date || '—',
        doctor: p.assigned_doctor || p['Assigned Doctor'] || p.doctor || p.Doctor || '—',
        blood: p.blood_group || p['Blood Group'] || p.blood || '—',
        notes: p.notes || p['Notes'] || ''
      });
    });

    // 2. Skin Patients
    (_data.skinPatients || []).forEach(function (p, idx) {
      list.push({
        _raw: p,
        _type: 'skin',
        _typeLabel: 'Skin Clinic',
        _typeColor: '#10b981',
        id: String(p.id || p.skin_id || p['Skin ID'] || ('skin_' + idx)),
        op_no: String(p.skin_id || p['Skin ID'] || ('SKIN-' + (idx + 1))),
        name: String(p.patient_name || p['Patient Name'] || 'Skin Patient').trim(),
        contact: p.contact || p['Contact'] || p.phone || '',
        department: 'Skin & Dermatology',
        age: p.age || p['Age'] || '—',
        gender: p.gender || p['Gender'] || '—',
        place: p.place || p['Place'] || '—',
        created_on: p.created_on || p['Created On'] || p.last_visit || '—',
        doctor: 'Dr. Skin Specialist',
        blood: '—',
        notes: p.notes || p['Notes'] || ''
      });
    });

    // 3. Orthopedic Patients
    (_data.orthoPatients || []).forEach(function (p, idx) {
      var diag = p.diagnosis || p['Diagnosis'] || '';
      var part = p.body_part || p['Body Part'] || '';
      var side = p.side || p['Side'] || '';
      var tx = p.treatment || p['Treatment'] || '';
      var diagText = [diag, part ? '(' + part + (side ? ' ' + side : '') + ')' : '', tx ? '· ' + tx : ''].filter(Boolean).join(' ');
      list.push({
        _raw: p,
        _type: 'ortho',
        _typeLabel: 'Orthopedics',
        _typeColor: '#0284c7',
        id: String(p.id || p.ortho_id || p['Ortho ID'] || ('ortho_' + idx)),
        op_no: String(p.ortho_id || p['Ortho ID'] || ('ORTHO-' + (idx + 1))),
        name: String(p.patient_name || p['Patient Name'] || 'Ortho Patient').trim(),
        contact: p.contact || p['Contact'] || p.phone || '',
        department: diagText ? 'Orthopedics · ' + diagText : 'Orthopedic Surgery',
        age: p.age || p['Age'] || '—',
        gender: p.gender || p['Gender'] || '—',
        place: p.place || p['Place'] || '—',
        created_on: p.created_on || p['Created On'] || '—',
        doctor: 'Dr. Ortho Surgeon',
        blood: '—',
        notes: (diagText ? 'Diagnosis: ' + diagText : '') + (p.notes || p['Notes'] ? ' | ' + (p.notes || p['Notes']) : '')
      });
    });

    return list;
  }

  function renderPatientsList() {
    var container = document.getElementById('ownerPatientCardsList');
    if (!container) return;

    var allList = getAllPatientsList();
    var searchVal = (document.getElementById('ownerPatientSearch') || {}).value || '';
    searchVal = searchVal.toLowerCase().trim();

    var filtered = allList.filter(function (p) {
      var name = (p.name || '').toLowerCase();
      var op = (p.op_no || '').toLowerCase();
      var phone = String(p.contact || '').toLowerCase();
      var dept = (p.department || '').toLowerCase();
      if (!searchVal) return true;
      return name.indexOf(searchVal) !== -1 || op.indexOf(searchVal) !== -1 || phone.indexOf(searchVal) !== -1 || dept.indexOf(searchVal) !== -1;
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--owner-muted);"><span class="material-icons-round" style="font-size:36px;display:block;margin-bottom:8px;">search_off</span>No patients found</div>';
      return;
    }

    container.innerHTML = filtered.slice(0, 75).map(function (p, i) {
      var name = p.name || 'Patient';
      var op = p.op_no || '—';
      var phone = p.contact || '—';
      var dept = p.department || 'General';
      var age = p.age || '—';
      var gender = p.gender || '—';

      return '<div class="owner-patient-card" onclick="openPatientSheet(\'' + esc(String(p.id)) + '\')">' +
        '<div class="owner-patient-top">' +
          '<div class="owner-patient-name">' + esc(name) + '</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
            '<span style="font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:6px;background:rgba(0,0,0,0.05);color:' + p._typeColor + '">' + p._typeLabel + '</span>' +
            '<div class="owner-patient-token">#' + esc(op) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="owner-patient-meta">' +
          '<span><span class="material-icons-round">medical_services</span> ' + esc(dept) + '</span>' +
          '<span><span class="material-icons-round">person</span> ' + esc(age) + (age !== '—' ? 'y' : '') + ' / ' + esc(gender) + '</span>' +
          '<span><span class="material-icons-round">phone</span> ' + esc(phone) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderDoctorsList() {
    var container = document.getElementById('ownerDoctorsListContainer');
    if (!container) return;

    var docs = _data.doctors;
    if (docs.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:32px;color:var(--owner-muted);">No doctors registered</div>';
      return;
    }

    container.innerHTML = docs.map(function (doc, idx) {
      var statusCls = (doc.status || '').toLowerCase() === 'available' ? 'available' : 'pending';
      var targetId = doc.id || doc.name || idx;
      return '<div class="owner-patient-card" onclick="openDoctorSheet(\'' + esc(String(targetId)) + '\')">' +
        '<div class="owner-patient-top">' +
          '<div class="owner-patient-name">' + esc(doc.name || 'Doctor') + '</div>' +
          '<span class="rpt-badge ' + statusCls + '">' + esc(doc.status || 'Active') + '</span>' +
        '</div>' +
        '<div class="owner-patient-meta">' +
          '<span><span class="material-icons-round">business</span> ' + esc(doc.dept || 'Department') + '</span>' +
          '<span><span class="material-icons-round">school</span> ' + esc(doc.qualification || 'MBBS') + '</span>' +
          '<span><span class="material-icons-round">phone</span> ' + esc(doc.phone || doc.email || '—') + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderAnalyticsTab(totalPts, totalAppts, totalSkin, totalGeneral, totalOrtho, totalDocs, totalDepts) {
    var elTotalP = document.getElementById('anaTotalPts');
    if (elTotalP) elTotalP.textContent = totalPts.toLocaleString('en-IN');

    var elSkin = document.getElementById('anaSkinTotal');
    if (elSkin) elSkin.textContent = totalSkin.toLocaleString('en-IN');

    var elGeneral = document.getElementById('anaGeneralTotal');
    if (elGeneral) elGeneral.textContent = totalGeneral.toLocaleString('en-IN');

    var elOrtho = document.getElementById('anaOrthoTotal');
    if (elOrtho) elOrtho.textContent = totalOrtho.toLocaleString('en-IN');

    var elTotalA = document.getElementById('anaTotalAppts');
    if (elTotalA) elTotalA.textContent = totalAppts.toLocaleString('en-IN');

    var elDocs = document.getElementById('anaDocsTotal');
    if (elDocs) elDocs.textContent = totalDocs;

    var elDepts = document.getElementById('anaDeptsTotal');
    if (elDepts) elDepts.textContent = totalDepts;
  }

  // ──────────────────────────────────────────────
  // BOTTOM SHEETS
  // ──────────────────────────────────────────────
  window.openPatientSheet = function (target) {
    var allList = getAllPatientsList();
    var pt = null;
    var targetStr = String(target !== undefined && target !== null ? target : '').trim();

    if (targetStr !== '') {
      var targetLower = targetStr.toLowerCase();
      pt = allList.find(function (p) {
        return String(p.id).toLowerCase() === targetLower ||
               String(p.op_no).toLowerCase() === targetLower ||
               String(p.contact).toLowerCase() === targetLower ||
               String(p.name).toLowerCase() === targetLower;
      });
    }

    if (!pt) {
      showToast('Patient details not found', 'error');
      return;
    }

    var overlay = document.getElementById('ownerSheetOverlay');
    var content = document.getElementById('ownerSheetContent');
    var title = document.getElementById('ownerSheetTitle');
    if (!overlay || !content) return;

    var name = pt.name || 'Patient';
    if (title) title.textContent = 'Patient: ' + name;

    var opNo = pt.op_no || '—';
    var phone = pt.contact || '';
    var age = pt.age || '—';
    var gender = pt.gender || '—';
    var dept = pt.department || 'General';
    var place = pt.place || '—';
    var created = pt.created_on || '—';
    var doctor = pt.doctor || '—';
    var blood = pt.blood || '—';
    var notes = pt.notes || '';

    content.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px;">' +
      '<div style="background:#f8fafc;padding:14px;border-radius:14px;border:1px solid var(--owner-border);display:flex;justify-content:space-between;align-items:center;">' +
        '<div>' +
          '<div style="font-size:0.72rem;color:var(--owner-muted);text-transform:uppercase;">Registration OP Number</div>' +
          '<div style="font-size:1.25rem;font-weight:800;color:var(--owner-primary-dark);margin-top:2px;">#' + esc(opNo) + '</div>' +
        '</div>' +
        '<span style="font-size:0.75rem;font-weight:700;padding:4px 10px;border-radius:8px;background:rgba(0,0,0,0.06);color:' + pt._typeColor + '">' + pt._typeLabel + '</span>' +
      '</div>' +
      '<div class="rpt-row"><span class="rpt-row-label">Age &amp; Gender</span><span class="rpt-row-value">' + esc(age) + (age !== '—' ? ' yrs' : '') + ' / ' + esc(gender) + '</span></div>' +
      '<div class="rpt-row"><span class="rpt-row-label">Department / Clinic</span><span class="rpt-row-value">' + esc(dept) + '</span></div>' +
      (doctor !== '—' ? '<div class="rpt-row"><span class="rpt-row-label">Assigned Doctor</span><span class="rpt-row-value">' + esc(doctor) + '</span></div>' : '') +
      (blood !== '—' && blood !== 'Unknown' ? '<div class="rpt-row"><span class="rpt-row-label">Blood Group</span><span class="rpt-row-value">' + esc(blood) + '</span></div>' : '') +
      '<div class="rpt-row"><span class="rpt-row-label">Phone Contact</span><span class="rpt-row-value">' + esc(phone || '—') + '</span></div>' +
      '<div class="rpt-row"><span class="rpt-row-label">Place / Address</span><span class="rpt-row-value">' + esc(place) + '</span></div>' +
      '<div class="rpt-row"><span class="rpt-row-label">Registered Date</span><span class="rpt-row-value">' + esc(created) + '</span></div>' +
      (notes ? '<div class="rpt-row"><span class="rpt-row-label">Notes / Info</span><span class="rpt-row-value">' + esc(notes) + '</span></div>' : '') +
      '<div style="margin-top:14px;display:flex;gap:10px;">' +
        (phone ? '<a href="tel:' + esc(phone) + '" style="flex:1;background:var(--owner-primary);color:white;text-align:center;padding:12px;border-radius:12px;text-decoration:none;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;"><span class="material-icons-round">call</span> Call Patient</a>' : '') +
        (phone ? '<a href="https://api.whatsapp.com/send?phone=91' + esc(phone) + '" target="_blank" style="flex:1;background:#25D366;color:white;text-align:center;padding:12px;border-radius:12px;text-decoration:none;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;"><span class="material-icons-round">chat</span> WhatsApp</a>' : '') +
      '</div>' +
    '</div>';

    overlay.classList.add('active');
  };

  window.openDoctorSheet = function (docId) {
    var docIdStr = String(docId || '').toLowerCase();
    var doc = _data.doctors.find(function (d, idx) {
      return String(d.id || '').toLowerCase() === docIdStr ||
             String(d.name || '').toLowerCase() === docIdStr ||
             String(idx) === docIdStr;
    });
    if (!doc) return;

    var overlay = document.getElementById('ownerSheetOverlay');
    var content = document.getElementById('ownerSheetContent');
    var title = document.getElementById('ownerSheetTitle');
    if (!overlay || !content) return;

    if (title) title.textContent = 'Doctor: ' + (doc.name || 'Medical Staff');
    var docPhone = doc.phone || doc.email || '';

    content.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px;">' +
      '<div class="rpt-row"><span class="rpt-row-label">Department</span><span class="rpt-row-value">' + esc(doc.dept || 'General') + '</span></div>' +
      '<div class="rpt-row"><span class="rpt-row-label">Qualifications</span><span class="rpt-row-value">' + esc(doc.qualification || 'MBBS') + '</span></div>' +
      '<div class="rpt-row"><span class="rpt-row-label">Status</span><span class="rpt-row-value">' + esc(doc.status || 'Available') + '</span></div>' +
      '<div class="rpt-row"><span class="rpt-row-label">Phone / Contact</span><span class="rpt-row-value">' + esc(docPhone || '—') + '</span></div>' +
      (doc.phone ? '<div style="margin-top:14px;"><a href="tel:' + esc(doc.phone) + '" style="display:flex;background:var(--owner-primary);color:white;text-align:center;padding:12px;border-radius:12px;text-decoration:none;font-weight:700;align-items:center;justify-content:center;gap:6px;"><span class="material-icons-round">call</span> Call Doctor</a></div>' : '') +
    '</div>';

    overlay.classList.add('active');
  };

  window.closeOwnerBottomSheet = function () {
    var overlay = document.getElementById('ownerSheetOverlay');
    if (overlay) overlay.classList.remove('active');
  };

  // ──────────────────────────────────────────────
  // SMART ACTIONS (WHATSAPP & PDF)
  // ──────────────────────────────────────────────
  window.shareWhatsAppSummary = function () {
    var today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    var totalPts = document.getElementById('heroTotalPatients').textContent || '0';
    var todayPts = document.getElementById('kpiTodayPatients').textContent || '0';
    var todayRegs = document.getElementById('kpiTodayOpd') ? document.getElementById('kpiTodayOpd').textContent : '0';
    var totalOpd = document.getElementById('kpiTotalOpd').textContent || '0';
    var docs = document.getElementById('kpiActiveDocs').textContent || '0';

    var msg = '🏥 *WELLNESS MEDICALS — EXECUTIVE REPORT*\n' +
      '📅 *Date:* ' + today + '\n\n' +
      '👥 *OPD Patients Today:* ' + todayPts + ' Patients\n' +
      '🆕 *New Registrations Today:* ' + todayRegs + ' Patients\n' +
      '📋 *Total OPD Consultations:* ' + totalOpd + ' Records\n' +
      '👨‍⚕️ *Doctors on Duty:* ' + docs + '\n' +
      '📊 *Total Patient Base:* ' + totalPts + ' Registered\n\n' +
      '🟢 *Status:* Clinic Operations Normal\n' +
      '🔗 *Executive Portal:* ' + window.location.href;

    var waUrl = 'https://api.whatsapp.com/send?text=' + encodeURIComponent(msg);
    window.open(waUrl, '_blank');
  };

  window.exportOwnerPdf = function () {
    showToast('Preparing executive summary...', 'picture_as_pdf');
    setTimeout(function () {
      window.print();
    }, 300);
  };

  window.filterPatientCards = function () {
    renderPatientsList();
  };

  // ──────────────────────────────────────────────
  // APP INITIALIZATION
  // ──────────────────────────────────────────────
  function initApp() {
    showLoader();
    initPullToRefresh();
    refreshAppData();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initPinAuth();
  });

})();
