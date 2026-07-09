'use strict';

var SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbwADFT-ngCU-uvcm_xjykk2pjHy5MFjZyoMJ_hpyBTpWCr_fl6BN9JSIgwZo6r0DLMDmA/exec';

var _patientsCache = null;
var _appointmentsCache = null;

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

function normalizePatient(p) {
  p.notes = p.notes || p['Notes'] || '';
  if (!p.op_no && p.notes) {
    var m = p.notes.match(/OP\s*No\.?\s*:?\s*(\d+)/i);
    if (m) p.op_no = m[1];
  }
  p.op_no = p.op_no || p['ID'] || p.id || '';
  p.id = p.op_no || p.id || p.ID || '';
  p.fname = p.fname || p['First Name'] || p.FirstName || p.Name || '';
  p.lname = p.lname || p['Last Name'] || p.LastName || '';
  p.contact = String(p.contact || p['Phone'] || p.Phone || p.phone || '');
  p.email = p.email || p['Email'] || p.Email || '';
  p.gender = p.gender || p['Gender'] || p.Gender || '';
  p.dob = p.dob || p['DOB'] || p.DOB || '';
  p.address = p.address || p['Address'] || '';
  p.blood_group = p.blood_group || p['Blood Group'] || p.Blood_Group || 'Unknown';
  p.department = p.department || p['Department'] || p.Department || 'General';
  p.patient_type = p.patient_type || p['Admission Type'] || p.Admission_Type || 'outpatient';
  p.status = p.status || p['Status'] || p.Status || 'stable';
  p.assigned_doctor = p.assigned_doctor || p['Assigned Doctor'] || '';
  p.last_visit = p.last_visit || p['Last Visit'] || '';
  return p;
}

window.API = {
  getPatients: function(params) {
    params = params || {};
    var q = { action: 'getPatients' };
    if (params.search) q.search = params.search;
    return sheetsFetch(q).then(function(resp) {
      if (resp.success && resp.data) {
        _patientsCache = resp.data = resp.data.map(normalizePatient);
        setLocalData('patients', resp.data); // sync local storage
        return resp;
      } else {
        console.warn('Using LocalStorage patients fallback.');
        var local = getLocalData('patients') || seedLocalPatients();
        if (params.search) {
          var search = params.search.toLowerCase();
          local = local.filter(function(p) {
            return (p.fname + ' ' + p.lname + ' ' + p.contact + ' ' + p.op_no).toLowerCase().indexOf(search) !== -1;
          });
        }
        _patientsCache = local;
        return { success: true, data: local, fallback: true };
      }
    });
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
    ['fname','lname','contact','email','gender','dob','address','blood_group','department','patient_type','status','assigned_doctor','notes'].forEach(function(k) {
      if (data[k]) q[k] = data[k];
    });
    return sheetsFetch(q).then(function(resp) {
      if (resp.success) {
        return resp;
      } else {
        var local = getLocalData('patients') || seedLocalPatients();
        var nextOp = 1001;
        local.forEach(function(p) {
          var num = parseInt(p.op_no || p.id, 10);
          if (!isNaN(num) && num >= nextOp) nextOp = num + 1;
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
          email: data.email || '',
          gender: data.gender || '',
          dob: data.dob || '',
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
          return { success: true, fallback: true };
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
  }
};

console.info('HMS: sheets-api.js loaded (JSONP + Resilient Offline Fallback). Set SHEETS_API_URL to your Apps Script.');
