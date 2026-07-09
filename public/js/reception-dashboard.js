/* =========================================
   RECEPTION-DASHBOARD.JS
   Front Desk Reception Portal Logic
   ========================================= */

'use strict';

let OPD_QUEUE = [];
let filteredOpdQueue = null;

/* --- Render OPD Queue --- */
function renderOpdQueue() {
  const list = document.getElementById('opdList');
  if (!list) return;

  const data = filteredOpdQueue || OPD_QUEUE;

  if (data.length === 0) {
    list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--outline);font-size:0.85rem">No patients found for this time span.</p>';
    const countEl = document.getElementById('opdQueueCount');
    if (countEl) countEl.textContent = '0 Waiting';
    return;
  }

  list.innerHTML = data.map(p => `
    <div class="opd-card ${p.status}" id="opdCard-${p.token}">
      <div class="queue-num">${p.token}</div>
      <div style="flex:1;min-width:0;">
        <div class="opd-name">${p.name} <span style="font-weight:400;color:var(--on-surface-var);font-size:0.78rem">· ${p.age}</span></div>
        <div class="opd-detail">${p.doctor} · ${p.complaint}</div>
        <div class="opd-detail" style="margin-top:2px;">${p.time}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        <span class="opd-status ${p.status}">${p.status === 'checked-in' ? '✓ Checked In' : p.status === 'urgent' ? '⚠ Urgent' : 'Waiting'}</span>
        ${p.status !== 'checked-in' ? `<button onclick="checkInByToken(${p.token})" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);color:#059669;border-radius:var(--radius-sm);padding:3px 8px;cursor:pointer;font-size:0.7rem;font-weight:700;">Check In</button>` : ''}
      </div>
    </div>
  `).join('');

  const countEl = document.getElementById('opdQueueCount');
  const waiting = data.filter(p => p.status === 'waiting' || p.status === 'urgent').length;
  if (countEl) countEl.textContent = `${waiting} Waiting`;
}

/* --- Filter OPD Queue --- */
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

  filteredOpdQueue = OPD_QUEUE.filter(p => {
    if (!p.timestamp) return false;
    const pTime = new Date(p.timestamp).getTime();
    return pTime >= startTimestamp && pTime <= endTimestamp;
  });

  renderOpdQueue();

  // Show result badge and update count
  const count = filteredOpdQueue.length;
  const countEl = document.getElementById('opdResultCount');
  if (countEl) countEl.textContent = `${count} patient${count !== 1 ? 's' : ''}`;
  const badge = document.getElementById('opdResultBadge');
  if (badge) badge.classList.add('visible');

  toast(`Found ${filteredOpdQueue.length} record(s)`, 'info');
}

function clearOpdQueueFilter() {
  document.getElementById('opdStartDate').value = '';
  document.getElementById('opdStartTime').value = '';
  document.getElementById('opdEndDate').value = '';
  document.getElementById('opdEndTime').value = '';
  filteredOpdQueue = null;
  renderOpdQueue();

  // Hide result badge
  const badge = document.getElementById('opdResultBadge');
  if (badge) badge.classList.remove('visible');

  toast('Filter cleared', 'info');
}

/* --- Check In by Token (quick action from list) --- */
async function checkInByToken(token) {
  const patient = OPD_QUEUE.find(p => p.token === token);
  if (patient) {
    patient.status = 'checked-in';
    try {
      await window.API.updateAppointment(patient.id, { status: 'checked-in' });
    } catch (e) {
      addConsoleLog('WARN', 'Could not update check-in status: ' + e.message);
    }
    renderOpdQueue();
    toast(`${patient.name} checked in successfully!`, 'success', 'how_to_reg');
  }
}

/* --- Patient Check-In Autocomplete Helpers --- */
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

/* --- Patient Check-In Autocomplete --- */
var ciSelectedPatient = null;

function initCheckinAutocomplete() {
  var input = document.getElementById('ciPatientSearch');
  var dropdown = document.getElementById('ciPatientDropdown');
  if (!input || !dropdown) return;

  function renderOptions(query) {
    var q = (query || '').toLowerCase();
    var patients = window.allPatients || [];
    var filtered = patients.filter(function (p) {
      return patientFullName(p).toLowerCase().includes(q) || patientContact(p).toLowerCase().includes(q);
    });
    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="autocomplete-item" style="color:var(--on-surface-var);cursor:default;">No patients found</div>';
      document.getElementById('ciPatientNotFound').style.display = 'block';
      return;
    }
    document.getElementById('ciPatientNotFound').style.display = 'none';
    dropdown.innerHTML = filtered.map(function (p) {
      var f = patientName(p);
      var l = patientLname(p);
      if (!f && !l) {
        var raw = p.Name || p.name || '';
        var parts = String(raw).trim().split(/\s+/);
        f = parts[0] || '';
        l = parts.slice(1).join(' ');
      }
      var initials = ((f || '')[0] || '') + ((l || '')[0] || '');
      var meta = [];
      var age = patientAge(p);
      var gender = patientGender(p);
      if (age) meta.push(age + 'y');
      if (gender) meta.push(gender);
      var contact = patientContact(p);
      if (contact) meta.push(contact);
      return '<div class="autocomplete-item" data-id="' + p.id + '" onclick="selectCheckinPatient(\'' + p.id + '\')">' +
        '<div class="ac-avatar">' + esc(initials) + '</div>' +
        '<div class="ac-info">' +
        '<span class="ac-name">' + esc(f) + ' ' + esc(l) + '</span>' +
        '<span class="ac-phone">' + esc(meta.join(' · ')) + '</span>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  input.addEventListener('focus', function () { renderOptions(input.value); dropdown.classList.add('active'); });
  input.addEventListener('input', function () {
    ciSelectedPatient = null;
    document.getElementById('ciPatientId').value = '';
    document.getElementById('ciPatientInfo').style.display = 'none';
    renderOptions(input.value);
    dropdown.classList.add('active');
  });
  document.addEventListener('click', function (e) {
    var wrapper = document.getElementById('ciPatientAutocomplete');
    if (wrapper && !wrapper.contains(e.target)) dropdown.classList.remove('active');
  });

  window.selectCheckinPatient = function (id) {
    var patients = window.allPatients || [];
    var p = patients.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    ciSelectedPatient = p;
    var f = patientName(p);
    var l = patientLname(p);
    if (!f && !l) {
      var raw = p.Name || p.name || '';
      var parts = String(raw).trim().split(/\s+/);
      f = parts[0] || '';
      l = parts.slice(1).join(' ');
    }
    document.getElementById('ciPatientId').value = p.id;
    input.value = (f + ' ' + l).trim();
    dropdown.classList.remove('active');
    var initials = ((f || '')[0] || '') + ((l || '')[0] || '');
    document.getElementById('ciPatientAvatar').textContent = initials;
    document.getElementById('ciPatientNameDisplay').textContent = (f + ' ' + l).trim();
    var meta = [];
    var age = patientAge(p);
    var gender = patientGender(p);
    if (age) meta.push(age + ' yrs');
    if (gender) meta.push(gender);
    if (p.blood_group && p.blood_group !== 'Unknown') meta.push(p.blood_group);
    if (p.op_no) meta.push('OP: ' + p.op_no);
    document.getElementById('ciPatientMetaDisplay').textContent = meta.join(' · ');
    document.getElementById('ciPatientInfo').style.display = 'block';
    document.getElementById('ciPatientNotFound').style.display = 'none';
  };
}

function openNewPatient() {
  closeModal(null, 'checkInModal');
  var searchQ = document.getElementById('ciPatientSearch')?.value.trim();
  if (typeof switchPage === 'function') {
    switchPage('patients');
    setTimeout(function() {
      var btn = document.querySelector('#page-patients #addPatientBtn');
      if (btn) btn.click();
    }, 150);
  } else {
    var target = 'patients.html' + (searchQ ? '?search=' + encodeURIComponent(searchQ) : '');
    window.location.href = target;
  }
}

/* --- Populate Doctor Dropdown in Check-In Modal --- */
function populateDoctorDropdown() {
  if (typeof window.populateDoctorDropdowns === 'function') {
    window.populateDoctorDropdowns();
  }
}

/* --- Open Check-In Modal --- */
function openCheckInModal() {
  openModal('checkInModal');
  populateDoctorDropdown();
  // Reset form state
  var input = document.getElementById('ciPatientSearch');
  if (input) input.value = '';
  document.getElementById('ciPatientId').value = '';
  document.getElementById('ciPatientInfo').style.display = 'none';
  document.getElementById('ciPatientNotFound').style.display = 'none';
  document.getElementById('ciComplaint').value = '';
  ciSelectedPatient = null;
  // Focus the search box
  setTimeout(function () { if (input) input.focus(); }, 120);
}

/* --- Patient Check-In (from modal) --- */
async function checkInPatient() {
  var p = ciSelectedPatient;
  if (!p) {
    toast('Please search and select a patient from the registry, or register a new one.', 'warning');
    return;
  }
  var doctor = document.getElementById('ciDoctor')?.value;
  var priority = document.getElementById('ciPriority')?.value || 'waiting';
  var complaint = document.getElementById('ciComplaint')?.value.trim() || 'Not specified';

  var nextToken = OPD_QUEUE.length + 1;
  var now = new Date();
  var record = {
    token: nextToken,
    id: p.id,
    name: patientFullName(p),
    age: p.age || 'N/A',
    doctor: doctor,
    complaint: complaint,
    status: priority,
    type: 'OPD',
    time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    timestamp: now.toISOString()
  };
  OPD_QUEUE.push(record);

  try {
    await window.API.createAppointment({
      patient_id: p.id,
      doctor_id: doctor,
      appointment_date: now.toISOString().split('T')[0],
      appointment_time: record.time,
      type: 'OPD',
      status: priority,
      reason: complaint
    });
  } catch (e) {
    addConsoleLog('WARN', 'Could not save check-in: ' + e.message);
  }

  renderOpdQueue();
  closeModal(null, 'checkInModal');

  ciSelectedPatient = null;
  document.getElementById('ciPatientSearch').value = '';
  document.getElementById('ciPatientId').value = '';
  document.getElementById('ciPatientInfo').style.display = 'none';
  document.getElementById('ciComplaint').value = '';

  toast('Token #' + nextToken + ' issued to ' + record.name + '!', 'success', 'how_to_reg');
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

  // Persist via API
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

  // Reset form
  document.getElementById('apptForm')?.reset();

  // Set today as default
  const dateEl = document.getElementById('apptDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  // Refresh stats immediately
  updateStats();
}

/* --- API Data Loaders --- */
async function loadOpdQueueFromFirestore() {
  try {
    const response = await window.API.getAppointments({ limit: 50 });
    const appointments = (response && response.success) ? (response.data || []) : [];
    var patientLookup = window.allPatients || [];
    OPD_QUEUE = appointments
      .filter(a => a.type === 'OPD' || a.type === 'OPD Consultation')
      .map((a, i) => {
        const tokenNum = a.token || i + 1;
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
        if (!name) name = 'Walk-in #' + tokenNum;
        if (!age) age = 'N/A';
        if (!doctor) doctor = 'Unassigned';
        return {
          id: a.id || tokenNum,
          token: tokenNum,
          name: name,
          age: age,
          doctor: doctor,
          complaint: a.reason || a.complaint || '—',
          status: a.status || 'waiting',
          time: a.appointment_time || a.time || '—',
          timestamp: a.createdAt || a.appointment_date || new Date().toISOString()
        };
      });
  } catch (e) {
    addConsoleLog('WARN', 'Could not load OPD queue: ' + e.message);
  } finally {
    renderOpdQueue();
  }
}

async function ensurePatientsLoaded() {
  if (window.allPatients && window.allPatients.length > 0) return;
  try {
    var result = await window.API.getPatients();
    if (result && result.data) {
      window.allPatients = result.data;
    }
  } catch (e) {
    console.warn('Could not load patients for autocomplete:', e);
  }
}

/* --- Update KPI Stat Cards --- */
function updateStats() {
  var todayStr = new Date().toISOString().split('T')[0];
  var todayOPD = OPD_QUEUE.filter(function (p) { return p.timestamp && p.timestamp.slice(0, 10) === todayStr; });

  var opdTotalEl = document.querySelector('.stat-card[style*="--accent:#ea580c"] .stat-value');
  if (opdTotalEl) {
    if (window.animateCounter) window.animateCounter(opdTotalEl, todayOPD.length);
    else opdTotalEl.textContent = todayOPD.length;
  }

  var waitingEl = document.querySelector('.stat-card[style*="--accent:#f59e0b"] .stat-value');
  var waiting = todayOPD.filter(function (p) { return p.status === 'waiting' || p.status === 'urgent'; });
  if (waitingEl) {
    if (window.animateCounter) window.animateCounter(waitingEl, waiting.length);
    else waitingEl.textContent = waiting.length;
  }

  var waitingDelta = document.querySelector('.stat-card[style*="--accent:#f59e0b"] .stat-delta');
  if (waitingDelta) waitingDelta.innerHTML = '<span class="material-icons-round">hourglass_empty</span>' + waiting.length + ' waiting now';

  var todayApptsEl = document.querySelector('.stat-card[style*="--accent:#0284c7"] .stat-value');
  if (todayApptsEl) {
    window.API.getAppointments().then(function (resp) {
      if (resp && resp.data) {
        var todayCount = resp.data.filter(function (a) { return a.appointment_date && a.appointment_date.slice(0, 10) === todayStr; }).length;
        if (window.animateCounter) window.animateCounter(todayApptsEl, todayCount);
        else todayApptsEl.textContent = todayCount;

        var apptDelta = document.querySelector('.stat-card[style*="--accent:#0284c7"] .stat-delta');
        if (apptDelta) apptDelta.innerHTML = '<span class="material-icons-round">event</span>' + todayCount + ' today';
      }
    }).catch(function () { });
  }
}

/* --- DOMContentLoaded --- */
document.addEventListener('DOMContentLoaded', async () => {
  // Apply dynamic user details and greeting
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

  // Update today's date badge
  var todayDateEl = document.getElementById('todayDate');
  if (todayDateEl) {
    todayDateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  await ensurePatientsLoaded();
  await loadOpdQueueFromFirestore();
  updateStats();

  // Re-run stats after OPD queue is filtered
  var origRender = renderOpdQueue;
  renderOpdQueue = function () { origRender(); updateStats(); };

  const todayChip = document.querySelector(`#opdSmartFilter .sf-chip[onclick*="'today'"]`);
  if (todayChip) {
    sfChipSelect(todayChip, 'opd', 'today');
  } else {
    renderOpdQueue();
  }

  var dateEl = document.getElementById('apptDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  initCheckinAutocomplete();

  // Populate dynamic dropdowns
  if (typeof window.populateAllDropdowns === 'function') window.populateAllDropdowns();
});
