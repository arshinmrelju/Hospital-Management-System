'use strict';

var SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbyEZNRHEKuTL_cvmhbz1FzQNN2H0Xvst31Ks7g7rJqislV0OILTgCpwkexA4uUPHuOfiw/exec';

var _patientsCache = null;
var _appointmentsCache = null;
var _patientsTotal = 0;
var _batchSize = 5000;
var _patientsLoading = null;

// One-time purge of stale seed/demo data from localStorage
(function() {
  var purgeKey = 'hms_seed_purged_v2';
  if (!localStorage.getItem(purgeKey)) {
    localStorage.removeItem('hms_local_patients');
    localStorage.removeItem('hms_local_appointments');
    localStorage.removeItem('hms_patients_cache');
    localStorage.setItem(purgeKey, '1');
    console.info('HMS: Purged stale demo/seed data from localStorage.');
  }
})();

// JSONP LocalStorage caching key helpers
function getLocalData(key) {
  try {
    var raw = localStorage.getItem('hms_local_' + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setLocalData(key, data) {
  try {
    localStorage.setItem('hms_local_' + key, JSON.stringify(data));
  } catch (e) {}
}

// Fallback: return empty arrays (production — no seed data)
function seedLocalPatients() {
  return [];
}

function seedLocalAppointments() {
  return [];
}

function sheetsFetch(params, callback) {
  if (!SHEETS_API_URL) {
    console.error('SHEETS_API_URL not configured. Set it above or see scripts/README.md');
    if (callback) callback({ success: false, error: 'API URL not configured' });
    return;
  }

  if (!callback) {
    return new Promise(function(resolve) {
      sheetsFetch(params, resolve);
    });
  }

  var callbackName = 'scb' + String(Math.random()).slice(2);
  
  // Google Apps Script cold starts can take 30+ seconds — allow 45s
  var timeoutId = setTimeout(function() {
    if (window[callbackName]) {
      console.warn('JSONP request timed out for action: ' + (params.action || 'unknown'));
      delete window[callbackName];
      var s = document.getElementById(callbackName);
      if (s) s.parentNode.removeChild(s);
      callback({ success: false, error: 'Request timed out' });
    }
  }, 45000);

  window[callbackName] = function(data) {
    clearTimeout(timeoutId);
    delete window[callbackName];
    var s = document.getElementById(callbackName);
    if (s) s.parentNode.removeChild(s);
    callback(data);
  };

  var url = SHEETS_API_URL + '?callback=' + callbackName;
  for (var key in params) {
    if (params.hasOwnProperty(key)) {
      url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(String(params[key]));
    }
  }

  var script = document.createElement('script');
  script.id = callbackName;
  script.src = url;
  script.onerror = function() {
    clearTimeout(timeoutId);
    delete window[callbackName];
    var s = document.getElementById(callbackName);
    if (s) s.parentNode.removeChild(s);
    callback({ success: false, error: 'Network error loading data' });
  };
  document.head.appendChild(script);
}

function isValidOpNo(val) {
  if (!val) return false;
  var n = Number(val);
  return Number.isInteger(n) && n > 0 && n < 1000000;
}

function normalizePatient(p) {
  p.notes = p.notes || p['Notes'] || '';
  if (!p.op_no && p.notes) {
    var m = p.notes.match(/OP\s*No\.?\s*:?\s*(\d+)/i);
    if (m) p.op_no = m[1];
  }
  if (p.op_no && !isValidOpNo(p.op_no)) p.op_no = '';
  if (!p.op_no) {
    var rawId = p['ID'] || p.id || '';
    if (isValidOpNo(rawId)) p.op_no = rawId;
  }
  p.id = p.op_no || '';
  p.fname = p.fname || p['First Name'] || p.FirstName || p.Name || '';
  p.lname = p.lname || p['Last Name'] || p.LastName || '';
  p.contact = String(p.contact || p['Phone'] || p.Phone || p.phone || '');
  p.gender = p.gender || p['Gender'] || p.Gender || '';
  p.age = p.age || p['Age'] || p.Age || '';
  p.address = p.address || p['Address'] || '';
  p.blood_group = p.blood_group || p['Blood Group'] || p.Blood_Group || 'Unknown';
  p.department = p.department || p['Department'] || p.Department || 'General';
  p.patient_type = p.patient_type || p['Admission Type'] || p.Admission_Type || 'outpatient';
  p.status = p.status || p['Status'] || p.Status || 'stable';
  p.assigned_doctor = p.assigned_doctor || p['Assigned Doctor'] || '';
  p.last_visit = p.last_visit || p['Last Visit'] || '';
  return p;
}

function fallbackPatients(params) {
  console.warn('Using LocalStorage patients fallback.');
  var local = getLocalData('patients') || seedLocalPatients();
  if (params && params.search) {
    var search = params.search.toLowerCase();
    local = local.filter(function(p) {
      return (p.fname + ' ' + p.lname + ' ' + p.contact + ' ' + p.op_no).toLowerCase().indexOf(search) !== -1;
    });
  }
  _patientsCache = local;
  _patientsTotal = local.length;
  return { success: true, data: local, fallback: true };
}

window.API = {
  getPatients: function(params) {
    params = params || {};

    // Dedup concurrent calls — return the same promise
    if (_patientsLoading) return _patientsLoading;

    var q = { action: 'getPatients' };
    if (params.search) q.search = params.search;

    var promise;

    // Searching uses a single request
    if (params.search) {
      promise = sheetsFetch(q).then(function(resp) {
        if (resp.success && resp.data) {
          resp.data = resp.data.map(normalizePatient);
          _patientsCache = resp.data;
          _patientsTotal = resp.total || resp.data.length;
          return resp;
        }
        return fallbackPatients(params);
      });
    } else {
      // Step 1: get paginated count; fall back if old server returns all data without "total"
      promise = sheetsFetch({ action: 'getPatients', limit: 1, offset: 0 }).then(function(meta) {
        if (!meta.success) {
          console.warn('Using LocalStorage patients fallback.');
          return fallbackPatients(params);
        }

        // Old server — returns everything in one shot, no total field
        if (meta.total === undefined) {
          var all = meta.data || [];
          _patientsTotal = all.length;
          _patientsCache = all.map(normalizePatient);
          setLocalData('patients', _patientsCache);
          return { success: true, data: _patientsCache };
        }

        var total = meta.total || 0;
        if (total === 0) {
          _patientsTotal = 0;
          _patientsCache = [];
          setLocalData('patients', []);
          return { success: true, data: [] };
        }
        _patientsTotal = total;

        // Step 2: fetch all pages sequentially with retry
        var allData = [];
        var batchSize = _batchSize;
        var pages = Math.ceil(total / batchSize);

        function loadPage(idx, retried) {
          if (idx >= pages) {
            _patientsCache = allData;
            setLocalData('patients', allData);
            return { success: true, data: allData };
          }
          var offset = idx * batchSize;
          var limit = Math.min(batchSize, total - offset);
          return sheetsFetch({ action: 'getPatients', offset: offset, limit: limit }).then(function(resp) {
            if (resp.success && resp.data) {
              allData = allData.concat(resp.data.map(normalizePatient));
              return loadPage(idx + 1);
            }
            // Retry failed batch once
            if (!retried) {
              console.warn('Retrying batch ' + idx + ' after failure');
              return loadPage(idx, true);
            }
            console.error('Batch ' + idx + ' failed after retry, skipping');
            return loadPage(idx + 1);
          });
        }
        return loadPage(0, false);
      });
    }

    // Store promise for dedup and clear when done
    _patientsLoading = promise.then(function(r) { _patientsLoading = null; return r; }, function(e) { _patientsLoading = null; throw e; });
    return _patientsLoading;
  },

  getPatient: function(id) {
    return sheetsFetch({ action: 'getPatient', id: id }).then(function(resp) {
      if (resp.success && resp.data) {
        resp.data = normalizePatient(resp.data);
        return resp;
      } else {
        var local = getLocalData('patients') || seedLocalPatients();
        var found = local.filter(function(p) { return String(p.id) === String(id); });
        if (found.length > 0) return { success: true, data: found[0], fallback: true };
        return { success: false, error: 'Patient not found' };
      }
    });
  },

  createPatient: function(data) {
    var q = { action: 'createPatient' };
    ['op_no','fname','lname','contact','gender','age','address','blood_group','department','patient_type','status','assigned_doctor','notes'].forEach(function(k) {
      if (data[k]) q[k] = data[k];
    });
    return sheetsFetch(q).then(function(resp) {
      if (resp.success) {
        return resp;
      } else {
        var local = getLocalData('patients') || seedLocalPatients();
        var nextOp = 1001;
        var providedOp = data.op_no ? parseInt(data.op_no, 10) : 0;
        if (!isNaN(providedOp) && providedOp > 0 && providedOp < 1000000) {
          var taken = local.some(function(p) {
            return parseInt(p.op_no || p.id, 10) === providedOp;
          });
          if (!taken) nextOp = providedOp;
        }
        local.forEach(function(p) {
          var val = p.op_no || p.id || '';
          var num = parseInt(val, 10);
          if (!isNaN(num) && num > 0 && num < 1000000 && num >= nextOp) nextOp = num + 1;
        });
        var now = new Date();
        var notes = data.notes || '';
        notes = notes ? notes + '\nOP No: ' + nextOp : 'OP No: ' + nextOp;
        var newPatient = normalizePatient({
          id: String(nextOp),
          op_no: String(nextOp),
          fname: data.fname || '',
          lname: data.lname || '',
          contact: data.contact || '',
          gender: data.gender || '',
          age: data.age || '',
          address: data.address || '',
          blood_group: data.blood_group || 'Unknown',
          department: data.department || 'General',
          patient_type: data.patient_type || 'outpatient',
          status: data.status || 'stable',
          assigned_doctor: data.assigned_doctor || '',
          last_visit: now.toISOString().split('T')[0],
          notes: notes
        });
        local.push(newPatient);
        setLocalData('patients', local);
        return { success: true, data: { id: String(nextOp), op_no: String(nextOp) }, fallback: true };
      }
    });
  },

  updatePatient: function(id, data) {
    var q = { action: 'updatePatient', id: id };
    for (var k in data) {
      if (data.hasOwnProperty(k) && k !== 'id') q[k] = data[k];
    }
    return sheetsFetch(q).then(function(resp) {
      if (resp.success) {
        return resp;
      } else {
        var local = getLocalData('patients') || seedLocalPatients();
        var idx = -1;
        for (var i = 0; i < local.length; i++) {
          if (String(local[i].id) === String(id) || String(local[i].op_no) === String(id)) {
            idx = i;
            break;
          }
        }
        if (idx >= 0) {
          for (var key in data) {
            if (data.hasOwnProperty(key) && key !== 'id') {
              local[idx][key] = data[key];
            }
          }
          setLocalData('patients', local);
          return { success: true, data: local[idx], fallback: true };
        }
        return { success: false, error: 'Patient not found' };
      }
    });
  },

  deletePatient: function(id) {
    return sheetsFetch({ action: 'deletePatient', id: id }).then(function(resp) {
      if (resp.success) {
        return resp;
      } else {
        var local = getLocalData('patients') || seedLocalPatients();
        var originalLength = local.length;
        local = local.filter(function(p) { return String(p.id) !== String(id) && String(p.op_no) !== String(id); });
        if (local.length < originalLength) {
          setLocalData('patients', local);
          return { success: true, fallback: true };
        }
        return { success: false, error: 'Patient not found' };
      }
    });
  },

  getAppointments: function() {
    return sheetsFetch({ action: 'getAppointments' }).then(function(resp) {
      if (resp.success && resp.data) {
        _appointmentsCache = resp.data;
        setLocalData('appointments', resp.data); // sync local storage
        return resp;
      } else {
        console.warn('Using LocalStorage appointments fallback.');
        var local = getLocalData('appointments') || seedLocalAppointments();
        _appointmentsCache = local;
        return { success: true, data: local, fallback: true };
      }
    });
  },

  getAppointment: function(id) {
    return window.API.getAppointments().then(function(resp) {
      if (resp.success && resp.data) {
        var found = resp.data.filter(function(a) { return String(a.id) === String(id); });
        if (found.length > 0) return { success: true, data: found[0], fallback: resp.fallback || false };
        return { success: false, error: 'Appointment not found' };
      }
      return resp;
    });
  },

  createAppointment: function(data) {
    var q = { action: 'createAppointment' };
    ['patient_id','patient_name','name','age','patientAge','doctor_id','doctor','doctor_name','appointment_date','appointment_time','type','status','reason','complaint'].forEach(function(k) {
      if (data[k]) q[k] = data[k];
    });
    return sheetsFetch(q).then(function(resp) {
      if (resp.success) {
        return resp;
      } else {
        var local = getLocalData('appointments') || seedLocalAppointments();
        var maxToken = 0;
        local.forEach(function(a) {
          if (a.token > maxToken) maxToken = a.token;
        });
        var now = new Date();
        var id = 'A' + String(now.getTime()).slice(-8);
        var newAppt = {
          id: id,
          token: maxToken + 1,
          patient_id: data.patient_id || '',
          patient_name: data.patient_name || data.name || '',
          patient_age: data.patientAge || data.age || '',
          doctor_id: data.doctor_id || '',
          doctor_name: data.doctor || data.doctor_name || '',
          appointment_date: data.appointment_date || now.toISOString().split('T')[0],
          appointment_time: data.appointment_time || now.toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit'}),
          type: data.type || 'OPD',
          status: data.status || 'waiting',
          reason: data.reason || data.complaint || '',
          createdAt: now.toISOString()
        };
        local.push(newAppt);
        setLocalData('appointments', local);
        return { success: true, data: { id: id, token: maxToken + 1 }, fallback: true };
      }
    });
  },

  updateAppointment: function(id, data) {
    var q = { action: 'updateAppointment', id: id };
    for (var k in data) {
      if (data.hasOwnProperty(k)) q[k] = data[k];
    }
    return sheetsFetch(q).then(function(resp) {
      if (resp.success) {
        return resp;
      } else {
        var local = getLocalData('appointments') || seedLocalAppointments();
        var idx = -1;
        for (var i = 0; i < local.length; i++) {
          if (String(local[i].id) === String(id)) {
            idx = i;
            break;
          }
        }
        if (idx >= 0) {
          for (var key in data) {
            if (data.hasOwnProperty(key)) {
              local[idx][key] = data[key];
            }
          }
          setLocalData('appointments', local);
          return { success: true, fallback: true };
        }
        return { success: false, error: 'Appointment not found' };
      }
    });
  },

  deleteAppointment: function(id) {
    return sheetsFetch({ action: 'deleteAppointment', id: id }).then(function(resp) {
      if (resp.success) {
        return resp;
      } else {
        var local = getLocalData('appointments') || seedLocalAppointments();
        var originalLength = local.length;
        local = local.filter(function(a) { return String(a.id) !== String(id); });
        if (local.length < originalLength) {
          setLocalData('appointments', local);
          return { success: true, fallback: true };
        }
        return { success: false, error: 'Appointment not found' };
      }
    });
  },

  getDoctors: function() {
    return sheetsFetch({ action: 'getDoctors' }).then(function(resp) {
      if (resp.success && resp.data) {
        return resp;
      } else {
        return { success: true, data: [
          { id: 'D001', initials: 'RS', name: 'Dr. Rajesh Sharma', dept: 'Cardiology' },
          { id: 'D002', initials: 'AP', name: 'Dr. Anita Patel', dept: 'Pediatrics' },
          { id: 'D003', initials: 'SV', name: 'Dr. Sunil Verma', dept: 'Orthopedics' }
        ], fallback: true };
      }
    });
  },

  createDoctor: function(data) {
    var q = { action: 'createDoctor' };
    ['name','initials','dept','phone','email','qualification','status'].forEach(function(k) {
      if (data[k]) q[k] = data[k];
    });
    return sheetsFetch(q);
  },

  updateDoctor: function(id, data) {
    var q = { action: 'updateDoctor', id: id };
    for (var k in data) {
      if (data.hasOwnProperty(k)) q[k] = data[k];
    }
    return sheetsFetch(q);
  },

  deleteDoctor: function(id) {
    return sheetsFetch({ action: 'deleteDoctor', id: id });
  },

  getDepartments: function() {
    return sheetsFetch({ action: 'getDepartments' }).then(function(resp) {
      if (resp.success && resp.data) {
        return resp;
      } else {
        return { success: true, data: [
          { id: 'DEP001', name: 'Cardiology', description: 'Heart and cardiovascular system', status: 'active' },
          { id: 'DEP002', name: 'Pediatrics', description: 'Medical care for infants, children, and adolescents', status: 'active' },
          { id: 'DEP003', name: 'Orthopedics', description: 'Musculoskeletal system', status: 'active' },
          { id: 'DEP004', name: 'Oncology', description: 'Cancer diagnosis and treatment', status: 'active' },
          { id: 'DEP005', name: 'Neurology', description: 'Nervous system disorders', status: 'active' },
          { id: 'DEP006', name: 'General Surgery', description: 'Surgical procedures', status: 'active' }
        ], fallback: true };
      }
    });
  },

  createDepartment: function(data) {
    var q = { action: 'createDepartment' };
    ['name','description','status'].forEach(function(k) {
      if (data[k]) q[k] = data[k];
    });
    return sheetsFetch(q);
  },

  updateDepartment: function(id, data) {
    var q = { action: 'updateDepartment', id: id };
    for (var k in data) {
      if (data.hasOwnProperty(k)) q[k] = data[k];
    }
    return sheetsFetch(q);
  },

  deleteDepartment: function(id) {
    return sheetsFetch({ action: 'deleteDepartment', id: id });
  },

  getSchedules: function() {
    return sheetsFetch({ action: 'getDoctors' }).then(function(resp) {
      if (resp.success && resp.data) {
        return resp;
      } else {
        return { success: true, data: [], fallback: true };
      }
    });
  },

  getMessages: function() {
    return sheetsFetch({ action: 'getMessages' }).then(function(resp) {
      if (resp.success && resp.data) {
        return resp;
      }
      return { success: true, data: [], fallback: true };
    });
  },

  createMessage: function(data) {
    var q = { action: 'createMessage' };
    ['title','message','sender','status','target'].forEach(function(k) {
      if (data[k]) q[k] = data[k];
    });
    return sheetsFetch(q);
  },

  deleteMessage: function(id) {
    return sheetsFetch({ action: 'deleteMessage', id: id });
  },

  /* ─── SKIN PATIENTS ─── */

  _skinPatientsCache: null,

  normalizeSkinPatient: function(p) {
    p.id = p['Skin ID'] || p.skin_id || '';
    p.skin_id = p.id;
    p.patient_name = p['Patient Name'] || p.patient_name || '';
    p.age = p['Age'] || p.age || '';
    p.gender = p['Gender'] || p.gender || '';
    p.contact = p['Contact'] || p.contact || '';
    p.skin_type = p['Skin Type'] || p.skin_type || '';
    p.condition = p['Condition'] || p.condition || '';
    p.body_area = p['Body Area'] || p.body_area || '';
    p.severity = p['Severity'] || p.severity || 'Mild';
    p.allergies = p['Allergies'] || p.allergies || '';
    p.treatment = p['Treatment'] || p.treatment || '';
    p.notes = p['Notes'] || p.notes || '';
    p.created_on = p['Created On'] || p.created_on || '';
    return p;
  },

  getSkinPatients: function() {
    return sheetsFetch({ action: 'getSkinPatients' }).then(function(resp) {
      if (resp.success && resp.data) {
        resp.data = resp.data.map(window.API.normalizeSkinPatient);
        window.API._skinPatientsCache = resp.data;
        setLocalData('skinPatients', resp.data);
        return resp;
      }
      console.warn('Using LocalStorage skin patients fallback.');
      var local = getLocalData('skinPatients') || [];
      window.API._skinPatientsCache = local.map(window.API.normalizeSkinPatient);
      return { success: true, data: window.API._skinPatientsCache, fallback: true };
    });
  },

  getSkinPatient: function(id) {
    return sheetsFetch({ action: 'getSkinPatient', id: id }).then(function(resp) {
      if (resp.success && resp.data) {
        resp.data = window.API.normalizeSkinPatient(resp.data);
        return resp;
      }
      var local = getLocalData('skinPatients') || [];
      var found = local.filter(function(p) { return String(p['Skin ID'] || p.skin_id || p.id) === String(id); });
      if (found.length > 0) return { success: true, data: window.API.normalizeSkinPatient(found[0]), fallback: true };
      return { success: false, error: 'Skin patient not found' };
    });
  },

  createSkinPatient: function(data) {
    var q = { action: 'createSkinPatient' };
    ['skin_id','patient_name','age','gender','contact','skin_type','condition','body_area','severity','allergies','treatment','notes'].forEach(function(k) {
      if (data[k]) q[k] = data[k];
    });
    return sheetsFetch(q).then(function(resp) {
      if (resp.success) {
        return resp;
      }
      var local = getLocalData('skinPatients') || [];
      var now = new Date();
      var newPatient = window.API.normalizeSkinPatient({
        'Skin ID': data.skin_id || '',
        'Patient Name': data.patient_name || '',
        'Age': data.age || '',
        'Gender': data.gender || '',
        'Contact': data.contact || '',
        'Skin Type': data.skin_type || '',
        'Condition': data.condition || '',
        'Body Area': data.body_area || '',
        'Severity': data.severity || 'Mild',
        'Allergies': data.allergies || '',
        'Treatment': data.treatment || '',
        'Notes': data.notes || '',
        'Created On': now.toISOString().split('T')[0]
      });
      local.push(newPatient);
      setLocalData('skinPatients', local);
      return { success: true, data: newPatient, fallback: true };
    });
  },

  updateSkinPatient: function(id, data) {
    var q = { action: 'updateSkinPatient', id: id };
    for (var k in data) {
      if (data.hasOwnProperty(k)) q[k] = data[k];
    }
    return sheetsFetch(q).then(function(resp) {
      if (resp.success) {
        return resp;
      }
      var local = getLocalData('skinPatients') || [];
      var idx = -1;
      for (var i = 0; i < local.length; i++) {
        var pid = local[i]['Skin ID'] || local[i].skin_id || local[i].id || '';
        if (String(pid) === String(id)) { idx = i; break; }
      }
      if (idx >= 0) {
        for (var key in data) {
          if (data.hasOwnProperty(key)) {
            local[idx][key] = data[key];
          }
        }
        setLocalData('skinPatients', local);
        return { success: true, data: window.API.normalizeSkinPatient(local[idx]), fallback: true };
      }
      return { success: false, error: 'Skin patient not found' };
    });
  },

  deleteSkinPatient: function(id) {
    return sheetsFetch({ action: 'deleteSkinPatient', id: id }).then(function(resp) {
      if (resp.success) {
        return resp;
      }
      var local = getLocalData('skinPatients') || [];
      var originalLength = local.length;
      local = local.filter(function(p) {
        var pid = p['Skin ID'] || p.skin_id || p.id || '';
        return String(pid) !== String(id);
      });
      if (local.length < originalLength) {
        setLocalData('skinPatients', local);
        return { success: true, fallback: true };
      }
      return { success: false, error: 'Skin patient not found' };
    });
  },

  /* ─── ORTHOPEDIC PATIENTS ─── */

  _orthopedicPatientsCache: null,

  normalizeOrthopedicPatient: function(p) {
    p.id = p['Ortho ID'] || p.ortho_id || '';
    p.ortho_id = p.id;
    p.patient_name = p['Patient Name'] || p.patient_name || '';
    p.age = p['Age'] || p.age || '';
    p.gender = p['Gender'] || p.gender || '';
    p.contact = p['Contact'] || p.contact || '';
    p.diagnosis = p['Diagnosis'] || p.diagnosis || '';
    p.body_part = p['Body Part'] || p.body_part || '';
    p.side = p['Side'] || p.side || '';
    p.condition_type = p['Condition Type'] || p.condition_type || '';
    p.severity = p['Severity'] || p.severity || 'Mild';
    p.treatment = p['Treatment'] || p.treatment || '';
    p.notes = p['Notes'] || p.notes || '';
    p.created_on = p['Created On'] || p.created_on || '';
    return p;
  },

  getOrthopedicPatients: function() {
    return sheetsFetch({ action: 'getOrthopedicPatients' }).then(function(resp) {
      if (resp.success && resp.data) {
        resp.data = resp.data.map(window.API.normalizeOrthopedicPatient);
        window.API._orthopedicPatientsCache = resp.data;
        setLocalData('orthopedicPatients', resp.data);
        return resp;
      }
      console.warn('Using LocalStorage orthopedic patients fallback.');
      var local = getLocalData('orthopedicPatients') || [];
      window.API._orthopedicPatientsCache = local.map(window.API.normalizeOrthopedicPatient);
      return { success: true, data: window.API._orthopedicPatientsCache, fallback: true };
    });
  },

  getOrthopedicPatient: function(id) {
    return sheetsFetch({ action: 'getOrthopedicPatient', id: id }).then(function(resp) {
      if (resp.success && resp.data) {
        resp.data = window.API.normalizeOrthopedicPatient(resp.data);
        return resp;
      }
      var local = getLocalData('orthopedicPatients') || [];
      var found = local.filter(function(p) { return String(p['Ortho ID'] || p.ortho_id || p.id) === String(id); });
      if (found.length > 0) return { success: true, data: window.API.normalizeOrthopedicPatient(found[0]), fallback: true };
      return { success: false, error: 'Orthopedic patient not found' };
    });
  },

  createOrthopedicPatient: function(data) {
    var q = { action: 'createOrthopedicPatient' };
    ['ortho_id','patient_name','age','gender','contact','diagnosis','body_part','side','condition_type','severity','treatment','notes'].forEach(function(k) {
      if (data[k]) q[k] = data[k];
    });
    return sheetsFetch(q).then(function(resp) {
      if (resp.success) {
        return resp;
      }
      var local = getLocalData('orthopedicPatients') || [];
      var now = new Date();
      var newPatient = window.API.normalizeOrthopedicPatient({
        'Ortho ID': data.ortho_id || '',
        'Patient Name': data.patient_name || '',
        'Age': data.age || '',
        'Gender': data.gender || '',
        'Contact': data.contact || '',
        'Diagnosis': data.diagnosis || '',
        'Body Part': data.body_part || '',
        'Side': data.side || '',
        'Condition Type': data.condition_type || '',
        'Severity': data.severity || 'Mild',
        'Treatment': data.treatment || '',
        'Notes': data.notes || '',
        'Created On': now.toISOString().split('T')[0]
      });
      local.push(newPatient);
      setLocalData('orthopedicPatients', local);
      return { success: true, data: newPatient, fallback: true };
    });
  },

  updateOrthopedicPatient: function(id, data) {
    var q = { action: 'updateOrthopedicPatient', id: id };
    for (var k in data) {
      if (data.hasOwnProperty(k)) q[k] = data[k];
    }
    return sheetsFetch(q).then(function(resp) {
      if (resp.success) {
        return resp;
      }
      var local = getLocalData('orthopedicPatients') || [];
      var idx = -1;
      for (var i = 0; i < local.length; i++) {
        var pid = local[i]['Ortho ID'] || local[i].ortho_id || local[i].id || '';
        if (String(pid) === String(id)) { idx = i; break; }
      }
      if (idx >= 0) {
        for (var key in data) {
          if (data.hasOwnProperty(key)) {
            local[idx][key] = data[key];
          }
        }
        setLocalData('orthopedicPatients', local);
        return { success: true, data: window.API.normalizeOrthopedicPatient(local[idx]), fallback: true };
      }
      return { success: false, error: 'Orthopedic patient not found' };
    });
  },

  deleteOrthopedicPatient: function(id) {
    return sheetsFetch({ action: 'deleteOrthopedicPatient', id: id }).then(function(resp) {
      if (resp.success) {
        return resp;
      }
      var local = getLocalData('orthopedicPatients') || [];
      var originalLength = local.length;
      local = local.filter(function(p) {
        var pid = p['Ortho ID'] || p.ortho_id || p.id || '';
        return String(pid) !== String(id);
      });
      if (local.length < originalLength) {
        setLocalData('orthopedicPatients', local);
        return { success: true, fallback: true };
      }
      return { success: false, error: 'Orthopedic patient not found' };
    });
  }
};

console.info('HMS: sheets-api.js loaded (JSONP + Resilient Offline Fallback). Set SHEETS_API_URL to your Apps Script.');
