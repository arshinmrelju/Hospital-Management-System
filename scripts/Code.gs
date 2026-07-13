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
  else if (action === 'createDoctor') result = handleCreateDoctor(e);
  else if (action === 'updateDoctor') result = handleUpdateDoctor(e);
  else if (action === 'deleteDoctor') result = handleDeleteDoctor(e);
  else if (action === 'getDepartments') result = handleGetDepartments(e);
  else if (action === 'createDepartment') result = handleCreateDepartment(e);
  else if (action === 'updateDepartment') result = handleUpdateDepartment(e);
  else if (action === 'deleteDepartment') result = handleDeleteDepartment(e);
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

function isValidOpNo(val) {
  if (!val) return false;
  var n = Number(val);
  return Number.isInteger(n) && n > 0 && n < 1000000;
}

function generateNextOpNo(rows, headers) {
  var idCol = headers.indexOf('ID');
  var notesCol = headers.indexOf('Notes');
  var maxOp = 0;
  for (var i = 1; i < rows.length; i++) {
    if (idCol >= 0) {
      var idVal = rows[i][idCol];
      if (isValidOpNo(idVal)) {
        var num = Number(idVal);
        if (num > maxOp) maxOp = num;
      }
    }
    if (notesCol >= 0) {
      var op = extractOpFromNotes(String(rows[i][notesCol] || ''));
      if (isValidOpNo(op)) {
        var num = Number(op);
        if (num > maxOp) maxOp = num;
      }
    }
  }
  return String(maxOp + 1);
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
    var rawId = p['ID'] || '';
    var rawUhid = p['UHID'] || '';
    p.op_no = opFromNotes || (isValidOpNo(rawId) ? rawId : '') || (isValidOpNo(rawUhid) ? rawUhid : '') || '';
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
    var rawId = p['ID'] || '';
    var rawUhid = p['UHID'] || '';
    p.op_no = opFromNotes || (isValidOpNo(rawId) ? rawId : '') || (isValidOpNo(rawUhid) ? rawUhid : '') || '';
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
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var row = [];
  var now = new Date();
  var notes = e.parameter.notes || '';
  var existingOp = extractOpFromNotes(notes);
  var opNo;
  if (existingOp) {
    opNo = existingOp;
  } else if (e.parameter.op_no && isValidOpNo(e.parameter.op_no)) {
    opNo = e.parameter.op_no;
    if (findPatientRow(opNo, allData, headers) >= 0) {
      opNo = generateNextOpNo(allData, headers);
    }
  } else {
    opNo = generateNextOpNo(allData, headers);
  }
  notes = notes ? notes + '\nOP No: ' + opNo : 'OP No: ' + opNo;
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
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var idCol = headers.indexOf('ID');
  if (idCol === -1) return { success: false, error: 'ID column not found' };
  var i = findPatientRow(e.parameter.id, allData, headers);
  if (i >= 0) {
    var row = allData[i];
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
        if (col >= 0) row[col] = e.parameter[key];
      }
    }
    sheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
    var p = {};
    for (var j = 0; j < headers.length; j++) p[headers[j]] = row[j];
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
    var opFromNotesU = extractOpFromNotes(p.notes);
    var rawIdU = p['ID'] || '';
    var rawUhidU = p['UHID'] || '';
    p.op_no = opFromNotesU || (isValidOpNo(rawIdU) ? rawIdU : '') || (isValidOpNo(rawUhidU) ? rawUhidU : '') || '';
    p.id = p.op_no;
    p.last_visit = p['Last Visit'] || '';
    p.created_on = p['Created On'] || '';
    return { success: true, data: p };
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
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var idCol = headers.indexOf('id');
  if (idCol === -1) return { success: false, error: 'id column not found' };
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][idCol]) === String(e.parameter.id)) {
      var row = allData[i];
      for (var j = 0; j < headers.length; j++) {
        var h = headers[j];
        if (h !== 'id' && e.parameter[h] !== undefined) {
          row[j] = e.parameter[h];
        }
      }
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([row]);
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

/* ─── HELPERS: Sheets ─── */

function getOrCreateSheet(ss, name, headers) {
  var s = ss.getSheetByName(name);
  if (s) return s;
  s = ss.insertSheet(name);
  if (headers && headers.length) s.appendRow(headers);
  return s;
}

function sheetToObjects(sheet) {
  var rows = sheet.getDataRange().getValues();
  if (!rows || rows.length < 2) return [];
  var headers = rows[0];
  var result = [];
  for (var i = 1; i < rows.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = rows[i][j];
    }
    result.push(obj);
  }
  return result;
}

function appendRowToSheet(sheet, data, headers) {
  var row = [];
  for (var j = 0; j < headers.length; j++) {
    row.push(data[headers[j]] !== undefined ? data[headers[j]] : '');
  }
  sheet.appendRow(row);
}

function findRowIndex(sheet, colName, value) {
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var col = headers.indexOf(colName);
  if (col === -1) return -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][col]) === String(value)) return i;
  }
  return -1;
}

/* ─── DOCTORS ─── */

function getDoctorsSheet(ss) {
  return getOrCreateSheet(ss, 'Doctors', ['id', 'name', 'initials', 'dept', 'phone', 'email', 'qualification', 'status', 'createdAt']);
}

function handleGetDoctors(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getDoctorsSheet(ss);
  var data = sheetToObjects(sheet);
  if (data.length === 0) {
    // Seed default doctors
    var defaults = [
      { id: 'D001', initials: 'RS', name: 'Dr. Rajesh Sharma', dept: 'Cardiology', phone: '', email: '', qualification: 'MD, DM Cardiology', status: 'available' },
      { id: 'D002', initials: 'AP', name: 'Dr. Anita Patel', dept: 'Pediatrics', phone: '', email: '', qualification: 'MD, Pediatrics', status: 'available' },
      { id: 'D003', initials: 'SV', name: 'Dr. Sunil Verma', dept: 'Orthopedics', phone: '', email: '', qualification: 'MS, Orthopedics', status: 'available' }
    ];
    var headers = sheet.getDataRange().getValues()[0];
    defaults.forEach(function(d) {
      var now = new Date().toISOString();
      d.createdAt = now;
      appendRowToSheet(sheet, d, headers);
    });
    return { success: true, data: defaults };
  }
  return { success: true, data: data };
}

function handleCreateDoctor(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getDoctorsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var maxId = 0;
  for (var i = 1; i < rows.length; i++) {
    var idStr = String(rows[i][headers.indexOf('id')] || 'D000');
    var num = parseInt(idStr.replace('D', ''), 10);
    if (!isNaN(num) && num > maxId) maxId = num;
  }
  var doctor = {
    id: 'D' + String(maxId + 1).padStart(3, '0'),
    name: e.parameter.name || '',
    initials: e.parameter.initials || '',
    dept: e.parameter.dept || '',
    phone: e.parameter.phone || '',
    email: e.parameter.email || '',
    qualification: e.parameter.qualification || '',
    status: e.parameter.status || 'available',
    createdAt: new Date().toISOString()
  };
  appendRowToSheet(sheet, doctor, headers);
  return { success: true, data: doctor };
}

function handleUpdateDoctor(e) {
  var id = e.parameter.id;
  if (!id) return { success: false, error: 'Doctor ID required' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getDoctorsSheet(ss);
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var idCol = headers.indexOf('id');
  if (idCol === -1) return { success: false, error: 'id column not found' };
  var idx = -1;
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][idCol]) === String(id)) { idx = i; break; }
  }
  if (idx === -1) return { success: false, error: 'Doctor not found' };
  var row = allData[idx];
  var map = {
    'name': 'name', 'initials': 'initials', 'dept': 'dept',
    'phone': 'phone', 'email': 'email', 'qualification': 'qualification', 'status': 'status'
  };
  for (var key in map) {
    if (e.parameter[key] !== undefined) {
      var col = headers.indexOf(map[key]);
      if (col >= 0) row[col] = e.parameter[key];
    }
  }
  sheet.getRange(idx + 1, 1, 1, headers.length).setValues([row]);
  return { success: true };
}

function handleDeleteDoctor(e) {
  var id = e.parameter.id;
  if (!id) return { success: false, error: 'Doctor ID required' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getDoctorsSheet(ss);
  var idx = findRowIndex(sheet, 'id', id);
  if (idx === -1) return { success: false, error: 'Doctor not found' };
  sheet.deleteRow(idx + 1);
  return { success: true };
}

/* ─── DEPARTMENTS ─── */

function getDepartmentsSheet(ss) {
  return getOrCreateSheet(ss, 'Departments', ['id', 'name', 'description', 'status', 'createdAt']);
}

function handleGetDepartments(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getDepartmentsSheet(ss);
  var data = sheetToObjects(sheet);
  if (data.length === 0) {
    var defaults = [
      { id: 'DEP001', name: 'Cardiology', description: 'Heart and cardiovascular system', status: 'active' },
      { id: 'DEP002', name: 'Pediatrics', description: 'Medical care for infants, children, and adolescents', status: 'active' },
      { id: 'DEP003', name: 'Orthopedics', description: 'Musculoskeletal system', status: 'active' },
      { id: 'DEP004', name: 'Oncology', description: 'Cancer diagnosis and treatment', status: 'active' },
      { id: 'DEP005', name: 'Neurology', description: 'Nervous system disorders', status: 'active' },
      { id: 'DEP006', name: 'General Surgery', description: 'Surgical procedures', status: 'active' }
    ];
    var headers = sheet.getDataRange().getValues()[0];
    defaults.forEach(function(d) {
      d.createdAt = new Date().toISOString();
      appendRowToSheet(sheet, d, headers);
    });
    return { success: true, data: defaults };
  }
  return { success: true, data: data };
}

function handleCreateDepartment(e) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getDepartmentsSheet(ss);
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];
  var maxId = 0;
  for (var i = 1; i < rows.length; i++) {
    var idStr = String(rows[i][headers.indexOf('id')] || 'DEP000');
    var num = parseInt(idStr.replace('DEP', ''), 10);
    if (!isNaN(num) && num > maxId) maxId = num;
  }
  var dept = {
    id: 'DEP' + String(maxId + 1).padStart(3, '0'),
    name: e.parameter.name || '',
    description: e.parameter.description || '',
    status: e.parameter.status || 'active',
    createdAt: new Date().toISOString()
  };
  appendRowToSheet(sheet, dept, headers);
  return { success: true, data: dept };
}

function handleUpdateDepartment(e) {
  var id = e.parameter.id;
  if (!id) return { success: false, error: 'Department ID required' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getDepartmentsSheet(ss);
  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var idCol = headers.indexOf('id');
  if (idCol === -1) return { success: false, error: 'id column not found' };
  var idx = -1;
  for (var i = 1; i < allData.length; i++) {
    if (String(allData[i][idCol]) === String(id)) { idx = i; break; }
  }
  if (idx === -1) return { success: false, error: 'Department not found' };
  var row = allData[idx];
  var map = { 'name': 'name', 'description': 'description', 'status': 'status' };
  for (var key in map) {
    if (e.parameter[key] !== undefined) {
      var col = headers.indexOf(map[key]);
      if (col >= 0) row[col] = e.parameter[key];
    }
  }
  sheet.getRange(idx + 1, 1, 1, headers.length).setValues([row]);
  return { success: true };
}

function handleDeleteDepartment(e) {
  var id = e.parameter.id;
  if (!id) return { success: false, error: 'Department ID required' };
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getDepartmentsSheet(ss);
  var idx = findRowIndex(sheet, 'id', id);
  if (idx === -1) return { success: false, error: 'Department not found' };
  sheet.deleteRow(idx + 1);
  return { success: true };
}
