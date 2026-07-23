/* =========================================
   RECEPTION-DASHBOARD.JS
   Front Desk Reception Portal Logic
   ========================================= */

'use strict';

let OPD_RECORDS = [];
window.OPD_RECORDS = OPD_RECORDS;
let filteredOpdRecords = null;
let opdDimension = 'all';

function _opdEntryKey(patientId, department, date) {
  var d = date || '';
  return String(patientId || '').toLowerCase().trim() + '::' + String(department || '').toLowerCase().trim() + '::' + d;
}

function _todayKey(patientId, department) {
  return _opdEntryKey(patientId, department, new Date().toISOString().split('T')[0]);
}

function _opdNameContactKey(name, contact) {
  return String(name || '').toLowerCase().trim() + '::' + String(contact || '').toLowerCase().trim();
}

function getOpdSeenKeys() {
  var keys = {};
  OPD_RECORDS.forEach(function(r) {
    var key = _opdEntryKey(r.patient_id || r.op_no, r.department);
    if (key) keys[key] = true;
  });
  return keys;
}

function isDuplicateOpdEntry(patientId, department, name, contact) {
  if (!patientId && !name) return false;
  var today = new Date().toISOString().split('T')[0];
  return OPD_RECORDS.some(function(r) {
    var rDate = (r.timestamp || '').split('T')[0] || '';
    if (rDate !== today) return false;
    if (patientId) {
      var key = _opdEntryKey(patientId, department, today);
      var rKey = _opdEntryKey(r.patient_id || r.op_no, r.department, today);
      if (rKey === key) return true;
    }
    if (name && contact) {
      var ncKey = _opdNameContactKey(name, contact);
      var rNcKey = _opdNameContactKey(r.name, r.contact);
      if (ncKey === rNcKey && String(r.department || '').toLowerCase().trim() === String(department || '').toLowerCase().trim()) return true;
    }
    return false;
  });
}

/* --- Export Tracker --- */
const EXPORTED_IDS_KEY = 'hms_exported_patient_ids';

function getExportedIds() {
  try {
    const raw = localStorage.getItem(EXPORTED_IDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function setExportedIds(ids) {
  localStorage.setItem(EXPORTED_IDS_KEY, JSON.stringify(ids));
}

function getUnexportedPatients() {
  const exportedIds = getExportedIds();
  const patients = window.allPatients || [];
  return patients.filter(p => !exportedIds.includes(String(p.id)));
}

function updateExportBadge() {
  const allPatients = window.allPatients || [];
  const allSkin = window.allSkinPatients || [];
  const allOrtho = window.allOrthoPatients || [];
  const pending = getUnexportedPatients();
  const count = pending.length;
  const total = allPatients.length + allSkin.length + allOrtho.length;

  /* Sidebar badge */
  const navBadge = document.getElementById('navExportBadge');
  if (navBadge) {
    navBadge.textContent = count;
    navBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  /* Export page stats */
  const totalStat = document.getElementById('exportTotalStat');
  const pendingStat = document.getElementById('exportPendingStat');
  const pendingBadge = document.getElementById('exportPendingBadgePage');
  const exportBtnPage = document.getElementById('exportNewBtnPage');

  if (totalStat) totalStat.textContent = total;
  if (pendingStat) pendingStat.textContent = count;
  if (pendingBadge) {
    pendingBadge.textContent = count;
    pendingBadge.style.display = count > 0 ? 'inline-flex' : 'none';
  }
  if (exportBtnPage) {
    if (count > 0) {
      exportBtnPage.style.display = 'inline-flex';
    } else {
      exportBtnPage.innerHTML = '<span class="material-icons-round">check_circle</span> All contacts exported';
    }
  }

  /* Last export time */
  const lastExportEl = document.getElementById('exportLastStat');
  if (lastExportEl) {
    try {
      const raw = localStorage.getItem('hms_last_export_time');
      if (raw) {
        const d = new Date(raw);
        lastExportEl.textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      } else {
        lastExportEl.textContent = 'Never';
      }
    } catch (e) {
      lastExportEl.textContent = '—';
    }
  }
}

function exportPatientsCSV(all) {
  const patients = all ? (window.allPatients || []) : getUnexportedPatients();
  if (patients.length === 0) {
    toast(all ? 'No patients in registry.' : 'No new patients to export.', 'info');
    return;
  }

  const headers = ['First Name', 'Last Name', 'Phone', 'Email', 'Age', 'Gender', 'Blood Group', 'Doctor', 'Department', 'OP No', 'Status'];
  const rows = patients.map(p => [
    patientName(p),
    patientLname(p),
    patientContact(p),
    String(p.email || p.Email || ''),
    patientAge(p),
    patientGender(p),
    String(p.blood_group || p.blood || p.Blood || p['Blood Group'] || p.BloodGroup || 'Unknown'),
    String(p.doctor || p.Doctor || p.doctor_name || ''),
    String(p.department || p.dept || p.Department || ''),
    String(p.op_no || p['Hosp. OP No'] || p['OP No'] || p['ID. NO'] || p['ID'] || p.op || ''),
    String(p.status || p.Status || 'stable')
  ].map(v => `"${v.replace(/"/g, '""')}"`).join(','));

  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const ts = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') + '-' + String(now.getMinutes()).padStart(2, '0');
  a.href = url;
  a.download = 'patient_contacts_' + ts + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  localStorage.setItem('hms_last_export_time', new Date().toISOString());

  if (!all) {
    const ids = patients.map(p => String(p.id));
    const exportedIds = getExportedIds();
    setExportedIds([...new Set([...exportedIds, ...ids])]);
  }

  updateExportBadge();
  toast('Exported ' + patients.length + ' contact(s) to CSV.', 'success', 'file_download');
}

function resetExportTracker() {
  if (!confirm('Reset export tracker? This will mark all patients as pending export.')) return;
  localStorage.removeItem(EXPORTED_IDS_KEY);
  updateExportBadge();
  toast('Export tracker reset. All patients marked as pending.', 'info', 'refresh');
}

function initExportTracker() {
  updateExportBadge();
}

/* --- Patient Helper Functions --- */
function patientName(p) {
  return String(p.fname || p.FirstName || p.Name || p.name || '');
}
function patientLname(p) {
  return String(p.lname || p.LastName || '');
}
function patientContact(p) {
  return String(p.contact || p.Phone || p.phone || p.mobile || p.Mobile || '');
}
function patientAge(p) {
  return String(p.age || p.Age || '');
}
function patientGender(p) {
  return String(p.gender || p.Gender || p.Sex || p.sex || '');
}
function patientFullName(p) {
  var f = patientName(p);
  var l = patientLname(p);
  if (!f && !l) {
    var raw = p.Name || p.name || '';
    var parts = String(raw).trim().split(/\s+/);
    f = parts[0] || '';
    l = parts.slice(1).join(' ');
  }
  return (f + ' ' + l).trim();
}

/* --- Render OPD Records --- */
function renderOpdRecords() {
  const list = document.getElementById('opdList');
  if (!list) return;

  var data = filteredOpdRecords || OPD_RECORDS;

  if (opdDimension !== 'all') {
    var dimLabel = opdDimension === 'skin' ? 'Skin' : opdDimension === 'ortho' ? 'Ortho' : 'General';
    data = data.filter(function (r) { return (r.department || 'General') === dimLabel; });
  }

  if (data.length === 0) {
    list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--outline);font-size:0.85rem">No OPD records found for this time span.</p>';
    return;
  }

  list.innerHTML = '<table class="data-table">' +
    '<thead><tr>' +
      '<th>SI No</th>' +
      '<th>Patient Id</th>' +
      '<th>Name</th>' +
      '<th>Age</th>' +
      '<th>Sex</th>' +
      '<th>Phone Number</th>' +
      '<th>Department</th>' +
    '</tr></thead><tbody>' +
    data.map(function (p, i) {
      var deptBadge = '';
      if (p.department === 'Skin') {
        deptBadge = '<span class="badge-status mild" style="background:var(--accent-teal-bg,rgba(8,145,178,0.15));color:var(--accent-teal,#0891b2);font-size:.7rem">Skin</span>';
      } else if (p.department === 'Ortho') {
        deptBadge = '<span class="badge-status mild" style="background:rgba(147,51,234,0.15);color:#9333ea;font-size:.7rem">Ortho</span>';
      } else if (p.department === 'Consultation') {
        deptBadge = '<span class="badge-status" style="background:var(--surface-mid);font-size:.7rem">Consultation</span>';
      } else {
        deptBadge = '<span class="badge-status" style="font-size:.7rem">General</span>';
      }

      /* --- "NEW" tag: shown if the patient was registered today --- */
      var todayStr = new Date().toISOString().slice(0, 10);
      var isNew = false;

      // 1. Explicit flag set at registration time (most reliable — covers skin/ortho/general new patients)
      if (p._isNew === true) {
        isNew = true;
      }

      // 2. Cross-check allPatients.created_on — works for general OPD patients already in the list
      if (!isNew) {
        var patientLookup = window.allPatients || [];
        var matchedPatient = patientLookup.find(function(pt) {
          var ptId = String(pt.op_no || pt.id || '');
          var recId = String(p.op_no || p.patient_id || p.id || '');
          return ptId && ptId !== '' && recId && recId !== '' && ptId === recId;
        });
        // Fallback: match by full name
        if (!matchedPatient && p.name) {
          matchedPatient = patientLookup.find(function(pt) {
            return patientFullName(pt).toLowerCase() === String(p.name).toLowerCase().trim();
          });
        }
        // Fallback: match by contact
        if (!matchedPatient && p.contact) {
          matchedPatient = patientLookup.find(function(pt) {
            return patientContact(pt).replace(/\s/g, '') === String(p.contact).replace(/\s/g, '');
          });
        }
        if (matchedPatient) {
          var createdOn = String(matchedPatient.created_on || matchedPatient['Created On'] || '').trim();
          if (createdOn) {
            if (/^\d{4}-\d{2}-\d{2}/.test(createdOn)) {
              isNew = createdOn.slice(0, 10) === todayStr;
            } else {
              var dt = new Date(createdOn);
              if (!isNaN(dt.getTime())) isNew = dt.toISOString().slice(0, 10) === todayStr;
            }
          }
        }
      }

      var newTag = isNew
        ? '<span class="opd-new-tag" title="Newly registered today">NEW</span>'
        : '';

      return '<tr' + (isNew ? ' class="opd-new-row"' : '') + '>' +
        '<td>' + (i + 1) + '</td>' +
        '<td>' + (p.op_no || p.patient_id || p.id || '—') + '</td>' +
        '<td><strong>' + (p.name || '') + '</strong>' + (newTag ? ' ' + newTag : '') + '</td>' +
        '<td>' + (p.age || '') + '</td>' +
        '<td>' + (p.gender || '—') + '</td>' +
        '<td>' + (p.contact || '—') + '</td>' +
        '<td>' + deptBadge + '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>';
}

function setOpdDimension(dim) {
  opdDimension = dim;
  document.querySelectorAll('.sf-dim-chip').forEach(function (c) { c.classList.remove('active'); });
  var chip = document.querySelector('.sf-dim-chip[data-dim="' + dim + '"]');
  if (chip) chip.classList.add('active');
  renderOpdRecords();
}

/* --- Filter OPD Records --- */
function filterOpdQueue() {
  const startDate = document.getElementById('opdStartDate')?.value;
  const startTime = document.getElementById('opdStartTime')?.value || '00:00';
  const endDate = document.getElementById('opdEndDate')?.value;
  const endTime = document.getElementById('opdEndTime')?.value || '23:59';

  if (!startDate) {
    toast('Please select a start date to filter.', 'warning');
    return;
  }

  const startTimestamp = new Date(`${startDate}T${startTime}`).getTime();
  const endTimestamp = endDate
    ? new Date(`${endDate}T${endTime}`).getTime()
    : new Date(`${startDate}T23:59:59`).getTime();

  filteredOpdRecords = OPD_RECORDS.filter(p => {
    if (!p.timestamp) return false;
    const pTime = new Date(p.timestamp).getTime();
    return pTime >= startTimestamp && pTime <= endTimestamp;
  });

  renderOpdRecords();

  const count = filteredOpdRecords.length;
  const countEl = document.getElementById('opdResultCount');
  if (countEl) countEl.textContent = `${count} patient${count !== 1 ? 's' : ''}`;
  const badge = document.getElementById('opdResultBadge');
  if (badge) badge.classList.add('visible');

  toast(`Found ${filteredOpdRecords.length} record(s)`, 'info');
}

function clearOpdQueueFilter() {
  document.getElementById('opdStartDate').value = '';
  document.getElementById('opdStartTime').value = '';
  document.getElementById('opdEndDate').value = '';
  document.getElementById('opdEndTime').value = '';
  filteredOpdRecords = null;
  opdDimension = 'all';
  document.querySelectorAll('.sf-dim-chip').forEach(function (c) { c.classList.remove('active'); });
  var allChip = document.querySelector('.sf-dim-chip[data-dim="all"]');
  if (allChip) allChip.classList.add('active');
  renderOpdRecords();

  const badge = document.getElementById('opdResultBadge');
  if (badge) badge.classList.remove('visible');

  toast('Filter cleared', 'info');
}

/* --- OPD Assign Doctor Modal --- */
let _opdAssignPatient = null;

window.addToOpdRegister = function(btn) {
  _opdAssignPatient = {
    id: btn.getAttribute('data-id') || '',
    name: btn.getAttribute('data-name') || '',
    age: btn.getAttribute('data-age') || '',
    gender: btn.getAttribute('data-gender') || '',
    blood: btn.getAttribute('data-blood') || 'Unknown',
    op: btn.getAttribute('data-op') || '',
    contact: btn.getAttribute('data-contact') || '',
    source: btn.getAttribute('data-source') || ''
  };

  var nameEl = document.getElementById('opdAssignName');
  var metaEl = document.getElementById('opdAssignMeta');
  var avatarEl = document.getElementById('opdAssignAvatar');
  if (nameEl) nameEl.textContent = _opdAssignPatient.name;
  if (avatarEl) {
    var parts = (_opdAssignPatient.name || '').trim().split(/\s+/);
    avatarEl.textContent = ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '');
  }
  if (metaEl) {
    var meta = [];
    if (_opdAssignPatient.age) meta.push(_opdAssignPatient.age + ' yrs');
    if (_opdAssignPatient.gender) meta.push(_opdAssignPatient.gender);
    if (_opdAssignPatient.op) meta.push('OP: ' + _opdAssignPatient.op);
    metaEl.textContent = meta.join(' · ');
  }

  populateAssignDoctor();
  openModal('opdAssignModal');
};

function populateAssignDoctor() {
  var sel = document.getElementById('opdAssignDoctor');
  if (!sel) return;
  var defaultDoctor = 'Dr. Sofiya';
  if (_opdAssignPatient) {
    if (_opdAssignPatient.source === 'skin') defaultDoctor = 'Dr. Ashok';
    else if (_opdAssignPatient.source === 'ortho') defaultDoctor = 'Dr. Sathish';
  }
  var docs = getCachedDoctors();
  if (docs) {
    renderDoctorOptions(sel, docs, defaultDoctor);
  } else {
    sel.innerHTML = '<option value="">Loading doctors...</option>';
    window.API.getDoctors().then(function(resp) {
      renderDoctorOptions(sel, (resp && resp.data) || [], defaultDoctor);
    });
  }
}

function renderDoctorOptions(sel, docs, selectedName) {
  sel.innerHTML = '<option value="">Select Doctor</option>' +
    docs.map(function(d) {
      var val = window.esc(d.name || d.id);
      var match = selectedName && d.name && d.name.trim().toLowerCase().includes(selectedName.trim().toLowerCase().replace(/^dr\.?\s*/i, ''));
      if (!match && selectedName && d.name) {
        match = selectedName.trim().toLowerCase().includes(d.name.trim().toLowerCase());
      }
      return '<option value="' + val + '"' + (match ? ' selected' : '') + '>' + window.esc(d.name) + ' (' + window.esc(d.dept) + ')</option>';
    }).join('');
}

function getCachedDoctors() {
  try {
    return window.API.getCachedDoctors ? window.API.getCachedDoctors() : null;
  } catch (e) {
    return null;
  }
}

function submitOpdAssign() {
  var patient = _opdAssignPatient;
  if (!patient) { toast('No patient selected.', 'warning'); return; }

  var doctor = document.getElementById('opdAssignDoctor')?.value;
  if (!doctor) { toast('Please select a doctor.', 'warning'); return; }

  var btn = document.getElementById('opdAssignSubmit');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

  var now = new Date();
  var timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  var isSkin = patient.source === 'skin';
  var isOrtho = patient.source === 'ortho';
  var record = {
    id: isSkin ? 'SKIN-OPD-' + Date.now() : isOrtho ? 'ORTHO-OPD-' + Date.now() : 'OPD-' + Date.now(),
    patient_id: patient.id || patient.op || '',
    name: patient.name || '',
    age: patient.age || 'N/A',
    gender: patient.gender || '',
    contact: patient.contact || '',
    op_no: patient.op || '',
    doctor: doctor,
    department: isSkin ? 'Skin' : isOrtho ? 'Ortho' : 'General',
    complaint: '—',
    time: timeStr,
    timestamp: now.toISOString()
  };

  if (isDuplicateOpdEntry(record.patient_id, record.department, record.name, record.contact)) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round" style="font-size:14px;">how_to_reg</span> Add to OPD'; }
    closeModal(null, 'opdAssignModal');
    toast(record.name + ' is already in ' + record.department + ' OPD', 'info');
    return;
  }

  OPD_RECORDS.push(record);
  if (filteredOpdRecords) filteredOpdRecords.push(record);

  window.API.createAppointment({
    patient_id: patient.id,
    patient_name: patient.name,
    name: patient.name,
    doctor_id: doctor,
    doctor_name: doctor,
    appointment_date: now.toISOString().split('T')[0],
    appointment_time: timeStr,
    type: isSkin ? 'Skin OPD' : isOrtho ? 'Ortho OPD' : 'OPD',
    status: 'waiting',
    reason: ''
  }).then(function(resp) {
    if (resp && !resp.success && resp.error === 'duplicate') {
      var idx = OPD_RECORDS.indexOf(record);
      if (idx > -1) OPD_RECORDS.splice(idx, 1);
      if (filteredOpdRecords) {
        var fidx = filteredOpdRecords.indexOf(record);
        if (fidx > -1) filteredOpdRecords.splice(fidx, 1);
      }
      renderOpdRecords();
      updateStats();
      toast(record.name + ' is already registered in ' + record.department + ' OPD today', 'info');
    }
  }).catch(function (e) {
    addConsoleLog('WARN', 'Could not save OPD record: ' + e.message);
  });

  _opdAssignPatient = null;
  closeModal(null, 'opdAssignModal');
  renderOpdRecords();
  updateStats();

  if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-icons-round" style="font-size:14px;">how_to_reg</span> Add to OPD'; }

  toast('Added to OPD: ' + record.name + ' → ' + doctor, 'success', 'how_to_reg');
}

/* --- Book Appointment --- */
async function bookAppointment(e) {
  e.preventDefault();
  const patient = document.getElementById('apptPatient')?.value.trim();
  const doctor = document.getElementById('apptDoctor')?.value;
  const date = document.getElementById('apptDate')?.value;
  const time = document.getElementById('apptTime')?.value;
  const type = document.getElementById('apptType')?.value;

  if (!patient) { toast('Please enter patient name.', 'warning'); return; }

  try {
    await window.API.createAppointment({
      patient_id: patient,
      doctor_id: doctor,
      appointment_date: date || new Date().toISOString().split('T')[0],
      appointment_time: time || '—',
      type: type || 'Check-up',
      status: 'scheduled',
      reason: ''
    });
  } catch (e) {
    addConsoleLog('WARN', 'Could not save appointment: ' + e.message);
  }

  toast(`Appointment confirmed! ${patient} → ${doctor} on ${date || 'Today'} at ${time}`, 'success', 'event_available');

  document.getElementById('apptForm')?.reset();

  const dateEl = document.getElementById('apptDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  updateStats();
}

/* --- API Data Loaders --- */
async function loadOpdRecords() {
  try {
    const response = await window.API.getAppointments({ limit: 50 });
    const appointments = (response && response.success) ? (response.data || []) : [];
    var patientLookup = window.allPatients || [];
    OPD_RECORDS = appointments
      .filter(a => a.type === 'OPD' || a.type === 'OPD Consultation' || a.type === 'Skin OPD' || a.type === 'Ortho OPD')
      .map((a, i) => {
        var name = a.patient_name || a.patientName || '';
        var age = a.patient_age || a.patientAge || a.age || '';
        var doctor = a.doctor || a.doctor_name || a.doctor_id || '';
        if ((!name || !doctor) && a.patient_id) {
          var match = patientLookup.find(function (p) { return String(p.id) === String(a.patient_id); });
          if (!match) {
            match = patientLookup.find(function (p) { return patientFullName(p).toLowerCase() === String(a.patient_id).toLowerCase(); });
          }
          if (!match) {
            match = patientLookup.find(function (p) { return (p.contact || '').replace(/\s/g, '') === String(a.patient_id).replace(/\s/g, ''); });
          }
          if (match) {
            if (!name) name = patientFullName(match);
            if (!age) age = patientAge(match);
            if (!doctor) doctor = match.doctor || match.doctor_name || '';
          }
        }
        if (!name) name = 'Unknown Patient';
        if (!age) age = 'N/A';
        if (!doctor) doctor = 'Unassigned';
        var match2 = patientLookup.find(function (p) { return patientFullName(p) === name || p.id === a.patient_id || (p.contact || '') === a.patient_id; });
        return {
          id: a.id || 'OPD-' + i,
          patient_id: a.patient_id || (match2 ? (match2.id || match2.op_no || match2['Hosp. OP No'] || match2['OP No'] || '') : ''),
          name: name,
          age: age,
          gender: (match2 ? patientGender(match2) : a.gender || a.sex || ''),
          contact: (match2 ? patientContact(match2) : a.phone || a.contact || ''),
          op_no: (match2 ? (match2.op_no || match2['Hosp. OP No'] || match2['OP No'] || '') : ''),
          doctor: doctor,
          department: a.type === 'Skin OPD' ? 'Skin' : a.type === 'Ortho OPD' ? 'Ortho' : (a.type === 'OPD Consultation' ? 'Consultation' : 'General'),
          complaint: a.reason || a.complaint || '—',
          time: a.appointment_time || a.time || '—',
          timestamp: a.createdAt || a.appointment_date || new Date().toISOString()
        };
      });
    var seen = {};
    var seenNc = {};
    OPD_RECORDS = OPD_RECORDS.filter(function(r) {
      var rDate = (r.timestamp || '').split('T')[0] || '';
      var key = _opdEntryKey(r.patient_id || r.op_no, r.department, rDate);
      var dept = String(r.department || '').toLowerCase().trim();
      var ncKey = _opdNameContactKey(r.name, r.contact) + '::' + dept + '::' + rDate;
      if (key && seen[key]) return false;
      if (ncKey && seenNc[ncKey]) return false;
      if (key) seen[key] = true;
      if (ncKey) seenNc[ncKey] = true;
      return true;
    });
  } catch (e) {
    addConsoleLog('WARN', 'Could not load OPD records: ' + e.message);
  } finally {
    renderOpdRecords();
  }
}

async function ensurePatientsLoaded() {
  if (window.allPatients && window.allPatients.length > 0) return;
  try {
    var result = await window.API.getPatients();
    if (result && result.data) {
      var data = typeof normalizePatients === 'function'
        ? normalizePatients(result.data)
        : result.data;
      if (Array.isArray(window.allPatients)) {
        window.allPatients.length = 0;
        data.forEach(function(item) { window.allPatients.push(item); });
      } else {
        window.allPatients = data;
      }
    }
  } catch (e) {
    console.warn('Could not load patients:', e);
  }
}

/* --- Daily OPD count storage (local) --- */
function getDailyCounts() {
  try {
    return JSON.parse(localStorage.getItem('hms_opd_daily_counts') || '{}');
  } catch (e) { return {}; }
}
function setDailyCounts(counts) {
  localStorage.setItem('hms_opd_daily_counts', JSON.stringify(counts));
}
function getYesterdayStr() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}
function getRegDailyCounts() {
  try {
    return JSON.parse(localStorage.getItem('hms_reg_daily_counts') || '{}');
  } catch (e) { return {}; }
}
function setRegDailyCounts(counts) {
  localStorage.setItem('hms_reg_daily_counts', JSON.stringify(counts));
}

/* --- Update KPI Stat Cards --- */
function updateStats() {
  var todayStr = new Date().toISOString().split('T')[0];
  var todayOPD = OPD_RECORDS.filter(function (p) { return p.timestamp && p.timestamp.slice(0, 10) === todayStr; });

  var opdTotalEl = document.querySelector('.stat-card[style*="--accent:#00685f"] .stat-value');
  if (opdTotalEl) {
    if (window.animateCounter) window.animateCounter(opdTotalEl, todayOPD.length);
    else opdTotalEl.textContent = todayOPD.length;
  }

  var counts = getDailyCounts();
  counts[todayStr] = todayOPD.length;
  setDailyCounts(counts);

  var yesterdayStr = getYesterdayStr();
  var yesterdayCount = counts[yesterdayStr];
  var opdDelta = document.querySelector('.stat-card[style*="--accent:#00685f"] .stat-delta');
  if (opdDelta) {
    if (yesterdayCount !== undefined && yesterdayCount !== null) {
      var diff = todayOPD.length - yesterdayCount;
      var icon = diff >= 0 ? 'trending_up' : 'trending_down';
      var cls = diff >= 0 ? 'positive' : 'negative';
      var sign = diff >= 0 ? '+' : '';
      opdDelta.className = 'stat-delta ' + cls;
      opdDelta.innerHTML = '<span class="material-icons-round">' + icon + '</span>' + sign + diff + ' vs yesterday';
    } else {
      opdDelta.className = 'stat-delta';
      opdDelta.innerHTML = '<span class="material-icons-round">show_chart</span>No prior data';
    }
  }

  /* --- New Registrations Today --- */
  function filterToday(patients) {
    return (patients || []).filter(function (p) {
      var d = p.created_on || p['Created On'] || '';
      if (!d) return false;
      d = String(d).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10) === todayStr;
      var dt = new Date(d);
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10) === todayStr;
      return false;
    });
  }
  var todayRegs = filterToday(window.allPatients).length + filterToday(window.allSkinPatients).length + filterToday(window.allOrthoPatients).length;
  var regEl = document.querySelector('.stat-card[style*="--accent:#0D9488"] .stat-value');
  if (regEl) {
    if (window.animateCounter) window.animateCounter(regEl, todayRegs);
    else regEl.textContent = todayRegs;
  }
  var regCounts = getRegDailyCounts();
  regCounts[todayStr] = todayRegs;
  setRegDailyCounts(regCounts);
  var regYesterday = regCounts[getYesterdayStr()];
  var regDelta = document.querySelector('.stat-card[style*="--accent:#0D9488"] .stat-delta');
  if (regDelta) {
    if (regYesterday !== undefined && regYesterday !== null) {
      var regDiff = todayRegs - regYesterday;
      var regIcon = regDiff >= 0 ? 'trending_up' : 'trending_down';
      var regCls = regDiff >= 0 ? 'positive' : 'negative';
      var regSign = regDiff >= 0 ? '+' : '';
      regDelta.className = 'stat-delta ' + regCls;
      regDelta.innerHTML = '<span class="material-icons-round">' + regIcon + '</span>' + regSign + regDiff + ' vs yesterday';
    } else {
      regDelta.className = 'stat-delta';
      regDelta.innerHTML = '<span class="material-icons-round">show_chart</span>No prior data';
    }
  }

  var todayApptsEl = document.querySelector('.stat-card[style*="--accent:#004d46"] .stat-value');
  if (todayApptsEl) {
    window.API.getAppointments().then(function (resp) {
      if (resp && resp.data) {
        var todayCount = resp.data.filter(function (a) { return a.appointment_date && a.appointment_date.slice(0, 10) === todayStr; }).length;
        if (window.animateCounter) window.animateCounter(todayApptsEl, todayCount);
        else todayApptsEl.textContent = todayCount;

        var apptDelta = document.querySelector('.stat-card[style*="--accent:#004d46"] .stat-delta');
        if (apptDelta) apptDelta.innerHTML = '<span class="material-icons-round">event</span>' + todayCount + ' today';
      }
    }).catch(function () { });
  }
}

/* --- Announcements / Broadcasts --- */
function loadAnnouncements() {
  window.API.getMessages().then(function(resp) {
    var msgs = (resp && resp.data) || [];
    var active = msgs.filter(function(m) { return m.status === 'active' && (m.target === 'reception' || m.target === 'all' || !m.target); });
    var bar = document.getElementById('announcementsBar');
    var body = document.getElementById('announcementsBody');
    if (!bar || !body) return;
    if (active.length === 0) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'block';
    document.getElementById('announcementsTitle').textContent = active.length === 1 ? '1 Announcement' : active.length + ' Announcements';
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
    console.warn('Failed to load announcements:', err);
  });
}

window.toggleAnnouncements = function() {
  var body = document.getElementById('announcementsBody');
  var icon = document.querySelector('.announcements-header .toggle-icon');
  if (!body || !icon) return;
  var hidden = body.style.display === 'none';
  body.style.display = hidden ? '' : 'none';
  icon.classList.toggle('collapsed', !hidden);
};

/* --- DOMContentLoaded --- */
document.addEventListener('DOMContentLoaded', async () => {
  var stored = localStorage.getItem('hms_auth');
  var userAvatar = document.getElementById('userAvatar');
  var topbarAvatar = document.getElementById('topbarAvatar');
  var sidebarUserName = document.getElementById('sidebarUserName');
  if (userAvatar) userAvatar.textContent = 'FD';
  if (topbarAvatar) topbarAvatar.textContent = 'FD';
  if (sidebarUserName) sidebarUserName.textContent = 'Front Desk';

  var greeting = document.getElementById('dashboardGreeting');
  if (greeting) {
    var hr = new Date().getHours();
    var greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
    greeting.textContent = greet + '! Front Desk is ready.';
  }

  var todayDateEl = document.getElementById('todayDate');
  if (todayDateEl) {
    todayDateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  await ensurePatientsLoaded();
  await loadOpdRecords();
  updateStats();
  initExportTracker();
  loadAnnouncements();

  var origRender = renderOpdRecords;
  renderOpdRecords = function () { origRender(); updateStats(); };

  const todayChip = document.querySelector(`#opdSmartFilter .sf-chip[onclick*="'today'"]`);
  if (todayChip) {
    sfChipSelect(todayChip, 'opd', 'today');
  } else {
    renderOpdRecords();
  }

  var dateEl = document.getElementById('apptDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  if (typeof window.populateAllDropdowns === 'function') window.populateAllDropdowns();
});
