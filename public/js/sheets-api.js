'use strict';

var SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbwN7RK6ZLeKWEeDZWUxcH7BpeJH-88ZwXe0qNvZC_LNDEdbbF8pkKGhXRgB_hfE62SP/exec';

var _patientsCache = null;
var _appointmentsCache = null;

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
  window[callbackName] = function(data) {
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
      }
      return resp;
    });
  },

  getPatient: function(id) {
    return sheetsFetch({ action: 'getPatient', id: id }).then(function(resp) {
      if (resp.success && resp.data) resp.data = normalizePatient(resp.data);
      return resp;
    });
  },

  createPatient: function(data) {
    var q = { action: 'createPatient' };
    ['fname','lname','contact','email','gender','dob','address','blood_group','department','patient_type','status','assigned_doctor','notes'].forEach(function(k) {
      if (data[k]) q[k] = data[k];
    });
    return sheetsFetch(q);
  },

  updatePatient: function(id, data) {
    var q = { action: 'updatePatient', id: id };
    for (var k in data) {
      if (data.hasOwnProperty(k) && k !== 'id') q[k] = data[k];
    }
    return sheetsFetch(q);
  },

  deletePatient: function(id) {
    return sheetsFetch({ action: 'deletePatient', id: id });
  },

  getAppointments: function() {
    return sheetsFetch({ action: 'getAppointments' }).then(function(resp) {
      if (resp.success && resp.data) {
        _appointmentsCache = resp.data;
      }
      return resp;
    });
  },

  getAppointment: function(id) {
    return window.API.getAppointments().then(function(resp) {
      if (resp.success && resp.data) {
        var found = resp.data.filter(function(a) { return String(a.id) === String(id); });
        if (found.length > 0) return { success: true, data: found[0] };
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
    return sheetsFetch(q);
  },

  updateAppointment: function(id, data) {
    var q = { action: 'updateAppointment', id: id };
    for (var k in data) {
      if (data.hasOwnProperty(k)) q[k] = data[k];
    }
    return sheetsFetch(q);
  },

  deleteAppointment: function(id) {
    return sheetsFetch({ action: 'deleteAppointment', id: id });
  },

  getDoctors: function() {
    return sheetsFetch({ action: 'getDoctors' });
  },

  getSchedules: function() {
    return sheetsFetch({ action: 'getDoctors' });
  }
};

console.info('HMS: sheets-api.js loaded (JSONP mode). Set SHEETS_API_URL to your Apps Script URL.');
