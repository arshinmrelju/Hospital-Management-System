var SHEET_ID = '15LoQpNHryWefHHIJ2teidjmL129NCoJ1NGl0dg4hjNk';

function doGet(e) {
  if (!e || !e.parameter) return ContentService.createTextOutput('test({"error":"No event parameter"})').setMimeType(ContentService.MimeType.JAVASCRIPT);
  var cb = e.parameter.callback || '';
  var action = e.parameter.action || '';

  var result = { success: false, error: 'Unknown action: ' + action };

  if (action === 'getPatients') result = handleGetPatients(e);
  else if (action === 'getPatient') result = handleGetPatient(e);
  else if (action === 'getAppointments') result = handleGetAppointments(e);
  else if (action === 'getDoctors') result = handleGetDoctors(e);
  else if (action === 'createPatient') result = handleCreatePatient(e);
  else if (action === 'updatePatient') result = handleUpdatePatient(e);
  else if (action === 'deletePatient') result = handleDeletePatient(e);
  else if (action === 'createAppointment') result = handleCreateAppointment(e);
  else if (action === 'updateAppointment') result = handleUpdateAppointment(e);
  else if (action === 'deleteAppointment') result = handleDeleteAppointment(e);

  var output = JSON.stringify(result);
  if (cb) output = cb + '(' + output + ')';
  return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/* ─── HELPERS ─── */

function extractOpFromNotes(notes) {
  if (!notes) return '';
  var m = notes.match(/OP\s*No\.?\s*:?\s*(\d+)/i);
  return m ? m[1] : '';
}

function findPatientRow(id, rows, headers) {
  var idCol = headers.indexOf('ID');
  var notesCol = headers.indexOf('Notes');
  for (var i = 1; i < rows.length; i++) {
    if (idCol >= 0 && String(rows[i][idCol]) === String(id)) return i;
    if (notesCol >= 0) {
      var notes = String(rows[i][notesCol] || '');
      var op = extractOpFromNotes(notes);
      if (op && String(op) === String(id)) return i;
    }
  }
  return -1;
}

/* ─── PATIENTS ─── */

function handleGetPatients(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Patients') || ss.getSheets()[0];
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var result = [];

  var search = (e.parameter.search || '').toLowerCase();

  for (var i = 1; i < rows.length; i++) {
    var p = {};
    for (var j = 0; j < headers.length; j++) {
      p[headers[j]] = rows[i][j];
    }
    p.fname = p['First Name'] || '';
    p.lname = p['Last Name'] || '';
    p.contact = String(p['Phone'] || '');
    p.email = p['Email'] || '';
    p.gender = p['Gender'] || '';
    p.dob = p['DOB'] || '';
    p.address = p['Address'] || '';
    p.blood_group = p['Blood Group'] || 'Unknown';
    p.department = p['Department'] || 'General';
    p.patient_type = p['Admission Type'] || 'outpatient';
    p.status = p['Status'] || 'stable';
    p.assigned_doctor = p['Assigned Doctor'] || '';
    p.uhid = p['UHID'] || '';
    p.notes = p['Notes'] || '';
    var opFromNotes = extractOpFromNotes(p.notes);
    p.op_no = opFromNotes || p['ID'] || p['UHID'] || '';
    p.id = p.op_no;
    p.last_visit = p['Last Visit'] || '';
    p.created_on = p['Created On'] || '';

    if (search) {
      var haystack = (p.fname + ' ' + p.lname + ' ' + p.contact + ' ' + p.op_no).toLowerCase();
      if (haystack.indexOf(search) === -1) continue;
    }

    result.push(p);
  }

  return { success: true, data: result };
}

function handleGetPatient(e) {
  var id = e.parameter.id;
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Patients') || ss.getSheets()[0];
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var rowIdx = findPatientRow(id, rows, headers);
  if (rowIdx >= 0) {
    var p = {};
    for (var j = 0; j < headers.length; j++) p[headers[j]] = rows[rowIdx][j];
    p.fname = p['First Name'] || '';
    p.lname = p['Last Name'] || '';
    p.contact = String(p['Phone'] || '');
    p.email = p['Email'] || '';
    p.gender = p['Gender'] || '';
    p.dob = p['DOB'] || '';
    p.address = p['Address'] || '';
    p.blood_group = p['Blood Group'] || 'Unknown';
    p.department = p['Department'] || 'General';
    p.patient_type = p['Admission Type'] || 'outpatient';
    p.status = p['Status'] || 'stable';
    p.assigned_doctor = p['Assigned Doctor'] || '';
    p.uhid = p['UHID'] || '';
    p.notes = p['Notes'] || '';
    var opFromNotes = extractOpFromNotes(p.notes);
    p.op_no = opFromNotes || p['ID'] || p['UHID'] || '';
    p.id = p.op_no;
    p.last_visit = p['Last Visit'] || '';
    p.created_on = p['Created On'] || '';
    return { success: true, data: p };
  }
  return { success: false, error: 'Patient not found' };
}

function handleCreatePatient(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Patients') || ss.getSheets()[0];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = [];
  var now = new Date();
  var notes = e.parameter.notes || '';
  var existingOp = extractOpFromNotes(notes);
  var opNo = existingOp || String(now.getTime()).slice(-6);
  if (!existingOp) {
    notes = notes ? notes + '\nOP No: ' + opNo : 'OP No: ' + opNo;
  }
  for (var j = 0; j < headers.length; j++) {
    var h = headers[j];
    if (h === 'ID') row.push(opNo);
    else if (h === 'First Name') row.push(e.parameter.fname || '');
    else if (h === 'Last Name') row.push(e.parameter.lname || '');
    else if (h === 'Phone') row.push(e.parameter.contact || '');
    else if (h === 'Email') row.push(e.parameter.email || '');
    else if (h === 'Gender') row.push(e.parameter.gender || '');
    else if (h === 'DOB') row.push(e.parameter.dob || '');
    else if (h === 'Address') row.push(e.parameter.address || '');
    else if (h === 'Blood Group') row.push(e.parameter.blood_group || 'Unknown');
    else if (h === 'Department') row.push(e.parameter.department || 'General');
    else if (h === 'Admission Type') row.push(e.parameter.patient_type || 'outpatient');
    else if (h === 'Status') row.push(e.parameter.status || 'stable');
    else if (h === 'Assigned Doctor') row.push(e.parameter.assigned_doctor || '');
    else if (h === 'UHID') row.push(e.parameter.uhid || '');
    else if (h === 'Last Visit') row.push(Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
    else if (h === 'Created On') row.push(Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'));
    else if (h === 'Notes') row.push(notes);
    else row.push('');
  }
  sheet.appendRow(row);
  return { success: true, data: { id: opNo, op_no: opNo } };
}

function handleUpdatePatient(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Patients') || ss.getSheets()[0];
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var idCol = headers.indexOf('ID');
  if (idCol === -1) return { success: false, error: 'ID column not found' };
  var i = findPatientRow(e.parameter.id, rows, headers);
  if (i >= 0) {
    var map = {
      'fname': 'First Name', 'lname': 'Last Name', 'contact': 'Phone',
      'email': 'Email', 'gender': 'Gender', 'dob': 'DOB', 'address': 'Address',
      'blood_group': 'Blood Group', 'department': 'Department',
      'patient_type': 'Admission Type', 'status': 'Status',
      'assigned_doctor': 'Assigned Doctor', 'uhid': 'UHID', 'notes': 'Notes'
    };
    for (var key in map) {
      if (e.parameter[key] !== undefined) {
        var col = headers.indexOf(map[key]);
        if (col >= 0) sheet.getRange(i + 1, col + 1).setValue(e.parameter[key]);
      }
    }
    return { success: true };
  }
  return { success: false, error: 'Patient not found' };
}

function handleDeletePatient(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Patients') || ss.getSheets()[0];
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var idCol = headers.indexOf('ID');
  if (idCol === -1) return { success: false, error: 'ID column not found' };
  var i = findPatientRow(e.parameter.id, rows, headers);
  if (i >= 0) {
    sheet.deleteRow(i + 1);
    return { success: true };
  }
  return { success: false, error: 'Patient not found' };
}

/* ─── APPOINTMENTS ─── */

function getAppointmentsSheet(ss) {
  var s = ss.getSheetByName('Appointments');
  if (s) return s;
  s = ss.insertSheet('Appointments');
  s.appendRow(['id', 'token', 'patient_id', 'patient_name', 'patient_age', 'doctor_id', 'doctor_name', 'appointment_date', 'appointment_time', 'type', 'status', 'reason', 'createdAt']);
  return s;
}

function handleGetAppointments(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getAppointmentsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var a = {};
    for (var j = 0; j < headers.length; j++) a[headers[j]] = rows[i][j];
    result.push(a);
  }
  return { success: true, data: result };
}

function handleCreateAppointment(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getAppointmentsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var lastToken = 0;
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][1] > lastToken) lastToken = rows[i][1];
  }
  var now = new Date();
  var id = 'A' + String(now.getTime()).slice(-8);
  sheet.appendRow([
    id, lastToken + 1,
    e.parameter.patient_id || '',
    e.parameter.patient_name || e.parameter.name || '',
    e.parameter.patientAge || e.parameter.age || '',
    e.parameter.doctor_id || '',
    e.parameter.doctor || e.parameter.doctor_name || '',
    e.parameter.appointment_date || Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    e.parameter.appointment_time || Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm'),
    e.parameter.type || 'OPD',
    e.parameter.status || 'waiting',
    e.parameter.reason || e.parameter.complaint || '',
    now.toISOString()
  ]);
  return { success: true, data: { id: id, token: lastToken + 1 } };
}

function handleUpdateAppointment(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getAppointmentsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var idCol = headers.indexOf('id');
  if (idCol === -1) return { success: false, error: 'id column not found' };
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(e.parameter.id)) {
      for (var j = 0; j < headers.length; j++) {
        var h = headers[j];
        if (h !== 'id' && e.parameter[h] !== undefined) {
          sheet.getRange(i + 1, j + 1).setValue(e.parameter[h]);
        }
      }
      return { success: true };
    }
  }
  return { success: false, error: 'Appointment not found' };
}

function handleDeleteAppointment(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getAppointmentsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var idCol = headers.indexOf('id');
  if (idCol === -1) return { success: false, error: 'id column not found' };
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][idCol]) === String(e.parameter.id)) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, error: 'Appointment not found' };
}

/* ─── DOCTORS ─── */

function handleGetDoctors(e) {
  return { success: true, data: [
    { id: 'D001', initials: 'RS', name: 'Dr. Rajesh Sharma', dept: 'Cardiology' },
    { id: 'D002', initials: 'AP', name: 'Dr. Anita Patel', dept: 'Pediatrics' },
    { id: 'D003', initials: 'SV', name: 'Dr. Sunil Verma', dept: 'Orthopedics' }
  ]};
}
