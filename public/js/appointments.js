'use strict';
HMS.requireAuth();

let allAppts = [];
let filteredAppts = [];
let selectedDate = new Date();
let weekOffset = 0;
let apptStatusFilter = 'all';
let currentView = 'list';
let appointmentEntryMode = 'scheduled';

function renderCalendarStrip() {
  const ref = new Date();
  ref.setDate(ref.getDate() + weekOffset * 7);
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - ref.getDay() + 1);

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthEl = document.getElementById('calMonthYear');
  if (monthEl) monthEl.textContent = `${months[monday.getMonth()]} ${monday.getFullYear()}`;

  const container = document.getElementById('calDays');
  if (!container) return;
  container.innerHTML = '';
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today = new Date(); today.setHours(0,0,0,0);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    d.setHours(0,0,0,0);
    const hasAppts = allAppts.some(a => a.date === d.toISOString().slice(0,10));
    const isToday = d.getTime() === today.getTime();
    const isSelected = d.getTime() === selectedDate.getTime();
    const div = document.createElement('div');
    div.className = `cal-day${isSelected ? ' active' : ''}${isToday ? ' today' : ''}${hasAppts ? ' has-appts' : ''}`;
    div.innerHTML = `<span class="day-name">${days[i]}</span><span class="day-num">${d.getDate()}</span><span class="day-dot"></span>`;
    div.addEventListener('click', () => {
      selectedDate = d;
      renderCalendarStrip();
      filterAppointments();
    });
    container.appendChild(div);
  }
}

function navigateWeek(dir) { weekOffset += dir; renderCalendarStrip(); filterAppointments(); }

function renderTimeline() {
  const timeline = document.getElementById('appointmentTimeline');
  if (!timeline) return;
  const dateStr = selectedDate.toISOString().slice(0,10);
  const dateSubEl = document.getElementById('apptDateSub');
  if (dateSubEl) dateSubEl.textContent = formatDateLong(selectedDate);

  const dayAppts = filteredAppts.filter(a => a.date === dateStr);
  const hours = ['08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','14:00','14:30','15:00','15:30','16:00','16:30','17:00'];

  if (dayAppts.length === 0) {
    timeline.innerHTML = '<div style="text-align:center;padding:48px;color:var(--on-surface-var)"><span class="material-icons-round" style="font-size:48px;display:block;margin-bottom:12px;color:var(--outline-var)">event_busy</span><p>No appointments for this day</p><div class="empty-appt-actions"><button class="btn-secondary" onclick="openSpotVisit()"><span class="material-icons-round">person_add</span> Spot Visit</button><button class="btn-primary" onclick="openBookAppointment()"><span class="material-icons-round">add</span> Book Appointment</button></div></div>';
    return;
  }

  const grouped = {};
  dayAppts.forEach(a => {
    const h = a.time;
    if (!grouped[h]) grouped[h] = [];
    grouped[h].push(a);
  });

  const usedHours = [...new Set(dayAppts.map(a => a.time))].sort();
  timeline.innerHTML = usedHours.map(hour => {
    const appts = grouped[hour] || [];
    return `
      <div class="timeline-slot">
        <div class="slot-time">${formatTime12(hour)}</div>
        <div class="slot-line"><div class="slot-dot" style="background:var(--primary-light)"></div><div class="slot-vline"></div></div>
        <div class="slot-cards">
          ${appts.map(a => `
            <div class="appt-card ${a.status}" onclick="viewAppt('${esc(a.id)}')">
              <div class="appt-type-icon"><span class="material-icons-round">${typeIcon(a.type)}</span></div>
              <div class="appt-info">
                <div class="appt-patient">${esc(a.patient)}</div>
                <div class="appt-doctor">${esc(a.doctor)} · ${esc(a.dept)}</div>
                <div class="appt-meta">
                  <span><span class="material-icons-round">schedule</span>${formatTime12(a.time)}</span>
                  <span><span class="material-icons-round">category</span>${esc(a.type)}</span>
                  <span class="badge-status ${a.status}">${cap(a.status)}</span>
                </div>
              </div>
              <div class="appt-actions">
                <button class="icon-btn" onclick="event.stopPropagation();editApptStatus('${esc(a.id)}')" title="Change Status"><span class="material-icons-round">more_vert</span></button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function esc(val) {
  return typeof val === 'string' ? val.replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  }) : (val == null ? '' : String(val));
}

function typeIcon(type) {
  const m = {Consultation:'person','Walk-in':'person_add',Surgery:'vaccines','Follow-up':'history',Lab:'science',Emergency:'emergency'};
  return m[type] || 'event';
}
function formatTime12(t) {
  if (!t) return '';
  const [h,m] = t.split(':').map(Number);
  return `${h > 12 ? h-12 : h || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
function formatDateLong(d) {
  return d.toLocaleDateString('en-IN', {weekday:'long',day:'numeric',month:'long',year:'numeric'});
}
function cap(s) { return s ? s.charAt(0).toUpperCase()+s.slice(1) : ''; }

function filterAppointments() {
  const search = (document.getElementById('apptSearch')?.value || '').toLowerCase();
  const doctor = document.getElementById('doctorFilter')?.value || '';
  filteredAppts = allAppts.filter(a => {
    if (search && !`${a.patient} ${a.doctor} ${a.dept}`.toLowerCase().includes(search)) return false;
    if (doctor && a.doctor !== doctor) return false;
    if (apptStatusFilter !== 'all' && a.status !== apptStatusFilter) return false;
    return true;
  });
  if (currentView === 'list') renderTimeline();
  else renderCalendarGrid();
}

function setApptFilter(btn, status) {
  document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  apptStatusFilter = status;
  filterAppointments();
}

function setView(view) {
  currentView = view;
  const listView = document.getElementById('listView');
  const calView = document.getElementById('calView');
  if (listView) listView.hidden = view !== 'list';
  if (calView) calView.hidden = view !== 'calendar';
  const listBtn = document.getElementById('listViewBtn');
  const calBtn = document.getElementById('calViewBtn');
  if (listBtn) listBtn.classList.toggle('active', view === 'list');
  if (calBtn) calBtn.classList.toggle('active', view === 'calendar');
  if (view === 'calendar') renderCalendarGrid();
  else renderTimeline();
}

function renderCalendarGrid() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  const today = new Date();
  const month = today.getMonth();
  const year = today.getFullYear();
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month+1, 0).getDate();

  const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  let html = `<div class="cal-grid-header">${dayNames.map(d => `<div class="cal-grid-day-label">${d}</div>`).join('')}</div>`;

  for (let i = 0; i < startDay; i++) html += '<div class="cal-cell other-month"></div>';

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayAppts = allAppts.filter(a => a.date === dateStr).slice(0,3);
    const isToday = d === today.getDate();
    html += `<div class="cal-cell${isToday ? ' today' : ''}">
      <div class="cal-date">${d}</div>
      ${dayAppts.map(a => `<span class="cal-appt-pill">${esc(a.time)} ${esc(a.patient.split(' ')[0])}</span>`).join('')}
    </div>`;
  }
  grid.innerHTML = html;
}

function viewAppt(id) {
  const a = allAppts.find(x => x.id === id);
  if (!a) return;
  toast(`${a.patient} – ${a.type} at ${formatTime12(a.time)}`, 'info', 'event');
}

function editApptStatus(id) {
  const statuses = ['confirmed','pending','completed','cancelled'];
  const a = allAppts.find(x => x.id === id);
  if (!a) return;
  const idx = statuses.indexOf(a.status);
  a.status = statuses[(idx+1) % statuses.length];
  filterAppointments();
  toast(`Status updated to ${cap(a.status)}`, 'success');
}

function localDateValue(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTimeValue(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function setAppointmentModalMode(mode) {
  appointmentEntryMode = mode;
  const isSpot = mode === 'spot';
  const now = new Date();
  const titleEl = document.getElementById('apptModalTitle');
  const submitEl = document.getElementById('apptSubmitBtn');
  const typeEl = document.getElementById('apptType');
  const dateEl = document.getElementById('apptDate');
  const timeEl = document.getElementById('apptTime');
  const notesEl = document.getElementById('apptNotes');
  if (titleEl) titleEl.textContent = isSpot ? 'Register Spot Visit' : 'Book Appointment';
  if (submitEl) submitEl.textContent = isSpot ? 'Register Spot Visit' : 'Confirm Booking';
  if (typeEl) typeEl.value = isSpot ? 'Walk-in' : 'Consultation';
  if (dateEl) dateEl.value = isSpot ? localDateValue(now) : localDateValue(selectedDate);
  if (timeEl) timeEl.value = isSpot ? localTimeValue(now) : '';
  if (notesEl) notesEl.placeholder = isSpot ? 'Walk-in reason or quick notes...' : 'Reason for visit...';
}

function openBookAppointment() {
  const form = document.getElementById('bookApptForm');
  if (form) form.reset();
  setAppointmentModalMode('scheduled');
  openModal('bookApptModal');
}

function openSpotVisit() {
  const form = document.getElementById('bookApptForm');
  if (form) form.reset();
  setAppointmentModalMode('spot');
  openModal('bookApptModal');
}

function submitBookAppt(e) {
  e.preventDefault();
  const isSpot = appointmentEntryMode === 'spot';
  const newA = {
    id: `APT${String(allAppts.length+1).padStart(3,'0')}`,
    patient: document.getElementById('apptPatient').value,
    doctor: document.getElementById('apptDoctor').value,
    dept: document.getElementById('apptDept').value || 'General',
    date: document.getElementById('apptDate').value,
    time: document.getElementById('apptTime').value,
    type: isSpot ? 'Walk-in' : document.getElementById('apptType').value,
    status: 'confirmed',
    notes: document.getElementById('apptNotes').value || (isSpot ? 'Spot visit / no prior appointment' : ''),
  };
  allAppts.push(newA);
  selectedDate = new Date(`${newA.date}T00:00:00`);
  closeModal(null, 'bookApptModal');
  const form = document.getElementById('bookApptForm');
  if (form) form.reset();
  setAppointmentModalMode('scheduled');
  renderCalendarStrip();
  filterAppointments();
  toast(`${isSpot ? 'Spot visit registered' : 'Appointment booked'} for ${newA.patient}!`, 'success');
}

function initPatientAutocomplete() {
  const input = document.getElementById('apptPatient');
  const dropdown = document.getElementById('patientDropdown');
  if (!input || !dropdown) return;

  function renderOptions(query = '') {
    const q = query.toLowerCase();
    const filtered = allPatients ? allPatients.filter(p =>
      p.name.toLowerCase().includes(q) || p.phone.includes(q)
    ) : [];
    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="autocomplete-item" style="color:var(--on-surface-var); cursor:default;">No patients found.</div>';
      return;
    }
    dropdown.innerHTML = filtered.map(p => `
      <div class="autocomplete-item" onclick="selectApptPatient('${esc(p.name)} - ${esc(p.phone)}')">
        <div class="ac-avatar">${esc(p.name.substring(0,2).toUpperCase())}</div>
        <div class="ac-info">
          <span class="ac-name">${esc(p.name)}</span>
          <span class="ac-phone">${esc(p.phone)}</span>
        </div>
      </div>
    `).join('');
  }

  input.addEventListener('focus', () => {
    renderOptions(input.value);
    dropdown.classList.add('active');
  });
  input.addEventListener('input', () => {
    renderOptions(input.value);
    dropdown.classList.add('active');
  });
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('patientAutocomplete');
    if (wrapper && !wrapper.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  window.selectApptPatient = function(val) {
    input.value = val;
    dropdown.classList.remove('active');
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const dateInput = document.getElementById('apptDate');
  if (dateInput) dateInput.value = localDateValue(new Date());
  renderCalendarStrip();
  renderTimeline();
  initPatientAutocomplete();
});
