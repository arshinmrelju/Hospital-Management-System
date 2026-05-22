/* =========================================
   RECEPTION-DASHBOARD.JS
   Front Desk Reception Portal Logic
   ========================================= */

'use strict';

let OPD_QUEUE = [];
let filteredOpdQueue = null;

/* --- Doctor Schedule (empty, to be loaded from Firestore) --- */
let DOCTOR_SCHEDULE = [];

/* --- Bed Allocation Data by Ward (empty, to be loaded from Firestore) --- */
let WARDS = {};

let currentWard = 'general';

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
function checkInByToken(token) {
  const patient = OPD_QUEUE.find(p => p.token === token);
  if (patient) {
    patient.status = 'checked-in';
    renderOpdQueue();
    toast(`${patient.name} checked in successfully!`, 'success', 'how_to_reg');
  }
}

/* --- Render Bed Grid --- */
function renderBedGrid(ward = currentWard) {
  const grid = document.getElementById('bedGrid');
  if (!grid) return;

  const beds = WARDS[ward] || [];
  const icons = { occupied: 'hotel', available: 'bed', reserved: 'bookmark', maintenance: 'build' };

  grid.innerHTML = beds.map(bed => `
    <div class="bed-cell ${bed.status}" onclick="toggleBed('${ward}', ${bed.num})" title="Bed ${bed.num} – ${bed.status.charAt(0).toUpperCase() + bed.status.slice(1)}">
      <span class="material-icons-round">${icons[bed.status]}</span>
      <span>${bed.num}</span>
    </div>
  `).join('');

  updateBedCounts(ward);
}

function updateBedCounts(ward) {
  const beds = WARDS[ward] || [];
  const counts = beds.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val || 0; };
  el('bedAvailCount', counts.available);
  el('bedOccupCount', counts.occupied);
  el('bedResCount', counts.reserved);
  el('bedMaintCount', counts.maintenance);
}

function toggleBed(ward, num) {
  const bed = WARDS[ward]?.find(b => b.num === num);
  if (!bed) return;
  const cycle = { available: 'occupied', occupied: 'reserved', reserved: 'maintenance', maintenance: 'available' };
  bed.status = cycle[bed.status] || 'available';
  renderBedGrid(ward);
  toast(`Bed ${num}: Status → ${bed.status}`, 'info', 'hotel');
}

/* --- Switch Ward Tab --- */
function showWard(ward, btn) {
  currentWard = ward;
  document.querySelectorAll('[id^="ward-"]').forEach(b => b.classList.remove('active-ward'));
  if (btn) btn.classList.add('active-ward');
  renderBedGrid(ward);
}

/* --- Render Doctor Schedule --- */
function renderDoctorSchedule() {
  const list = document.getElementById('doctorScheduleList');
  if (!list) return;

  list.innerHTML = DOCTOR_SCHEDULE.map(doc => `
    <div class="doc-schedule-row">
      <div class="doc-avatar-sm">${doc.initials}</div>
      <div>
        <div class="doc-name">${doc.name}</div>
        <div class="doc-dept">${doc.dept}</div>
      </div>
      <div class="doc-slots">
        ${doc.slots.map(s => `<span class="slot-chip ${s.type}">${s.time}</span>`).join('')}
      </div>
    </div>
  `).join('');
}

/* --- Patient Check-In (from modal) --- */
function checkInPatient() {
  const name = document.getElementById('ciName')?.value.trim();
  const age = document.getElementById('ciAge')?.value.trim() || 'N/A';
  const doctor = document.getElementById('ciDoctor')?.value;
  const priority = document.getElementById('ciPriority')?.value || 'waiting';
  const complaint = document.getElementById('ciComplaint')?.value.trim() || 'Not specified';

  if (!name) { toast('Please enter the patient name.', 'warning'); return; }

  const nextToken = OPD_QUEUE.length + 1;
  OPD_QUEUE.push({
    token: nextToken,
    name,
    age,
    doctor,
    complaint,
    status: priority,
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date().toISOString()
  });

  renderOpdQueue();
  closeModal(null, 'checkInModal');

  // Clear form
  ['ciName', 'ciAge', 'ciComplaint'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  toast(`Token #${nextToken} issued to ${name}!`, 'success', 'how_to_reg');
}

/* --- Book Appointment --- */
function bookAppointment(e) {
  e.preventDefault();
  const patient = document.getElementById('apptPatient')?.value.trim();
  const doctor = document.getElementById('apptDoctor')?.value;
  const date = document.getElementById('apptDate')?.value;
  const time = document.getElementById('apptTime')?.value;
  const type = document.getElementById('apptType')?.value;

  if (!patient) { toast('Please enter patient name.', 'warning'); return; }

  toast(`Appointment confirmed! ${patient} → ${doctor} on ${date || 'Today'} at ${time}`, 'success', 'event_available');

  // Reset form
  document.getElementById('apptForm')?.reset();

  // Set today as default
  const dateEl = document.getElementById('apptDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
}

/* --- Live Clock --- */
function updateClock() {
  const el = document.getElementById('currentTime');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}

/* --- Active Ward Button Style --- */
const wardBtnStyle = `
  .active-ward {
    background: var(--primary-light) !important;
    color: white !important;
    border-color: var(--primary-light) !important;
  }
`;
const s = document.createElement('style');
s.textContent = wardBtnStyle;
document.head.appendChild(s);

/* --- DOMContentLoaded --- */
document.addEventListener('DOMContentLoaded', () => {
  const todayChip = document.querySelector(`#opdSmartFilter .sf-chip[onclick*="'today'"]`);
  if (todayChip) {
    sfChipSelect(todayChip, 'opd', 'today');
  } else {
    renderOpdQueue();
  }
  renderBedGrid('general');
  renderDoctorSchedule();
  updateClock();
  setInterval(updateClock, 1000);

  // Set today's date as default for appointment form
  const dateEl = document.getElementById('apptDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  // New patient arrivals will come from Firestore
});
