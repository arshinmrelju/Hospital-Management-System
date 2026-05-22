'use strict';

let PATIENT_QUEUE = [];

let filteredPatientQueue = null;
let activePatientId = null;
const prescriptionMeds = [];

function renderPatientQueue() {
  const container = document.getElementById('patientQueueContainer');
  if (!container) return;

  const priorityColors = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
  const statusLabels = { waiting: 'Waiting', 'in-progress': 'In Consultation', done: 'Done' };

  const data = filteredPatientQueue || PATIENT_QUEUE;

  if (data.length === 0) {
    container.innerHTML = '<p style="padding:12px; font-size:0.875rem; text-align:center; color:var(--on-surface-var)">No patients found for this time span.</p>';
    const countEl = document.getElementById('docResultCount');
    if (countEl) countEl.textContent = '0 consults';
    return;
  }

  container.innerHTML = data.map(p => `
    <div class="queue-list-item ${activePatientId === p.id ? 'active' : ''}" 
         onclick="selectPatient('${esc(p.id)}')" id="qItem-${esc(p.id)}">
      <div style="display:flex;align-items:center;gap:12px;flex:1;">
        <div style="width:8px;height:8px;border-radius:50%;background:${priorityColors[p.priority] || '#10b981'};flex-shrink:0;"></div>
        <div>
          <div style="font-weight:700;font-size:0.87rem;">${esc(p.name)} 
            <span style="font-weight:400;font-size:0.77rem;color:var(--on-surface-var)">· ${esc(p.age)}${esc(p.gender)}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--on-surface-var);margin-top:2px;">${esc(p.complaint)}</div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <span style="font-size:0.72rem;font-weight:700;padding:3px 8px;border-radius:20px;
          background:${p.status === 'in-progress' ? 'rgba(59,130,246,0.1)' : p.status === 'done' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'};
          color:${p.status === 'in-progress' ? '#3b82f6' : p.status === 'done' ? '#059669' : '#d97706'};">
          ${statusLabels[p.status] || p.status}
        </span>
        <div style="font-size:0.72rem;color:var(--outline);margin-top:4px;">${esc(p.time)}</div>
      </div>
    </div>
  `).join('');

  const countEl = document.getElementById('docResultCount');
  if (countEl) countEl.textContent = `${data.length} consults`;
}

function esc(val) {
  return typeof val === 'string' ? val.replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  }) : (val == null ? '' : String(val));
}

function filterPatientQueue() {
  const startDate = document.getElementById('docStartDate')?.value;
  const startTime = document.getElementById('docStartTime')?.value || '00:00';
  const endDate = document.getElementById('docEndDate')?.value;
  const endTime = document.getElementById('docEndTime')?.value || '23:59';

  if (!startDate) {
    toast('Please select a start date to filter.', 'warning');
    return;
  }

  const startTimestamp = new Date(`${startDate}T${startTime}`).getTime();
  const endTimestamp = endDate 
    ? new Date(`${endDate}T${endTime}`).getTime()
    : new Date(`${startDate}T23:59:59`).getTime();

  filteredPatientQueue = PATIENT_QUEUE.filter(p => {
    const pTime = new Date(p.timestamp).getTime();
    return pTime >= startTimestamp && pTime <= endTimestamp;
  });

  renderPatientQueue();
  const badge = document.getElementById('docResultBadge');
  if (badge) badge.classList.add('visible');
  toast(`Found ${filteredPatientQueue.length} patient(s)`, 'info');
}

function clearPatientQueueFilter() {
  document.getElementById('docStartDate').value = '';
  document.getElementById('docStartTime').value = '';
  document.getElementById('docEndDate').value = '';
  document.getElementById('docEndTime').value = '';
  filteredPatientQueue = null;
  renderPatientQueue();
  const badge = document.getElementById('docResultBadge');
  if (badge) badge.classList.remove('visible');
  toast('Filter cleared', 'info');
}

function selectPatient(id) {
  activePatientId = id;
  const p = PATIENT_QUEUE.find(pt => pt.id === id);
  if (!p) return;

  if (p.status === 'waiting') {
    p.status = 'in-progress';
    renderPatientQueue();
  }

  document.querySelectorAll('.queue-list-item').forEach(el => {
    el.classList.toggle('active', el.id === `qItem-${id}`);
  });

  const profile = document.getElementById('activePatientProfile');
  if (profile) {
    profile.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div style="display:flex;align-items:center;gap:14px;padding-bottom:12px;border-bottom:1px solid var(--outline-var);">
          <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--primary-light),var(--primary-dark));display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:1.1rem;flex-shrink:0;">
            ${esc((p.name||'U').split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2))}
          </div>
          <div>
            <div style="font-weight:800;font-size:1rem;">${esc(p.name)}</div>
            <div style="font-size:0.8rem;color:var(--on-surface-var);">${esc(p.id)} · Age ${esc(p.age)} · ${esc(p.gender === 'M' ? 'Male' : 'Female')} · ${esc(p.time)}</div>
            <div style="font-size:0.82rem;color:var(--on-surface);margin-top:3px;">${esc(p.complaint)}</div>
          </div>
        </div>

        <div>
          <p style="font-size:0.75rem;font-weight:700;color:var(--on-surface-var);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Current Vitals</p>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
            ${[
              { label: 'Blood Pressure', val: p.vitals.bp, icon: 'favorite', alert: p.vitals.bp.split('/')[0] > 140 },
              { label: 'Pulse Rate', val: p.vitals.pulse + ' bpm', icon: 'monitor_heart', alert: p.vitals.pulse > 100 },
              { label: 'Temperature', val: p.vitals.temp, icon: 'thermostat', alert: parseFloat(p.vitals.temp) > 99.5 },
              { label: 'SpO₂', val: p.vitals.spo2, icon: 'air', alert: parseInt(p.vitals.spo2) < 95 },
            ].map(v => `
              <div style="background:${v.alert ? 'rgba(239,68,68,0.07)' : 'var(--surface-low)'};border:1px solid ${v.alert ? 'rgba(239,68,68,0.2)' : 'var(--outline-var)'};border-radius:var(--radius-sm);padding:10px 12px;display:flex;align-items:center;gap:8px;">
                <span class="material-icons-round" style="font-size:18px;color:${v.alert ? '#ef4444' : 'var(--primary-light)'}">${v.icon}</span>
                <div>
                  <div style="font-size:0.7rem;color:var(--on-surface-var);">${v.label}</div>
                  <div style="font-weight:800;font-size:0.92rem;color:${v.alert ? '#ef4444' : 'var(--on-surface)'};">${v.val}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <div style="background:var(--surface-low);border:1px solid var(--outline-var);border-radius:var(--radius-sm);padding:12px;">
          <p style="font-size:0.75rem;font-weight:700;color:var(--on-surface-var);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:6px;">Medical History</p>
          <p style="font-size:0.85rem;color:var(--on-surface);">${esc(p.history)}</p>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <button class="btn-secondary btn-sm" onclick="requestLabTest('${esc(p.id)}')">
            <span class="material-icons-round">science</span> Request Lab Test
          </button>
          <button class="btn-secondary btn-sm" onclick="markConsultDone('${esc(p.id)}')">
            <span class="material-icons-round">check_circle</span> Complete Consult
          </button>
        </div>
      </div>
    `;
  }

  toast(`Patient ${p.name} loaded into workspace.`, 'info', 'person');
}

function addMedicationToScript() {
  const medSelect = document.getElementById('presMedSelect');
  const dosageInput = document.getElementById('presDosage');
  const listEl = document.getElementById('selectedMedsList');
  if (!medSelect || !listEl) return;
  const med = medSelect.value;
  const dosage = dosageInput?.value?.trim() || 'As directed';
  if (prescriptionMeds.find(m => m.med === med)) {
    toast('This medication is already in the prescription.', 'warning');
    return;
  }
  prescriptionMeds.push({ med, dosage });
  listEl.innerHTML = prescriptionMeds.map((m, i) => `
    <span class="medicine-tag">
      <span class="material-icons-round" style="font-size:12px">medication</span>
      ${esc(m.med)} · ${esc(m.dosage)}
      <button onclick="removeMedication(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;display:inline-flex;padding:0;margin-left:2px;">
        <span class="material-icons-round" style="font-size:14px">close</span>
      </button>
    </span>
  `).join('');
  if (dosageInput) dosageInput.value = '';
  toast(`${med} added to prescription.`, 'success', 'medication');
}

function removeMedication(index) {
  prescriptionMeds.splice(index, 1);
  const listEl = document.getElementById('selectedMedsList');
  if (!listEl) return;
  if (prescriptionMeds.length === 0) {
    listEl.innerHTML = '<span style="font-size:0.8rem;color:var(--outline);font-style:italic;">No drugs added yet. Enter items above.</span>';
    return;
  }
  listEl.innerHTML = prescriptionMeds.map((m, i) => `
    <span class="medicine-tag">
      <span class="material-icons-round" style="font-size:12px">medication</span>
      ${esc(m.med)} · ${esc(m.dosage)}
      <button onclick="removeMedication(${i})" style="background:none;border:none;color:#ef4444;cursor:pointer;display:inline-flex;padding:0;margin-left:2px;">
        <span class="material-icons-round" style="font-size:14px">close</span>
      </button>
    </span>
  `).join('');
}

document.getElementById('presBuilderForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!activePatientId) { toast('Please select a patient first.', 'warning'); return; }
  if (prescriptionMeds.length === 0) { toast('Add at least one medication to the prescription.', 'warning'); return; }
  const patient = PATIENT_QUEUE.find(p => p.id === activePatientId);
  if (patient) {
    patient.status = 'done';
    renderPatientQueue();
  }
  toast(`Prescription for ${patient?.name} sent to Pharmacy! (${prescriptionMeds.length} medication${prescriptionMeds.length > 1 ? 's' : ''})`, 'success', 'send');
  prescriptionMeds.length = 0;
  const listEl = document.getElementById('selectedMedsList');
  if (listEl) listEl.innerHTML = '<span style="font-size:0.8rem;color:var(--outline);font-style:italic;">No drugs added yet. Enter items above.</span>';
  const diag = document.getElementById('presDiagnosis');
  if (diag) diag.value = '';
  activePatientId = null;
});

function requestLabTest(patientId) {
  const patient = PATIENT_QUEUE.find(p => p.id === patientId);
  toast(`Lab test request sent for ${patient?.name}!`, 'info', 'science');
}

function markConsultDone(patientId) {
  const patient = PATIENT_QUEUE.find(p => p.id === patientId);
  if (patient) {
    patient.status = 'done';
    renderPatientQueue();
    const profile = document.getElementById('activePatientProfile');
    if (profile) {
      profile.innerHTML = `
        <div style="text-align:center;padding:24px;color:var(--outline);">
          <span class="material-icons-round" style="font-size:36px;color:var(--primary-light)">check_circle</span>
          <p style="font-size:0.85rem;margin-top:8px;font-weight:600;color:var(--on-surface)">Consultation marked complete for ${esc(patient.name)}.</p>
          <p style="font-size:0.78rem;margin-top:4px;">Select the next patient from the queue.</p>
        </div>
      `;
    }
    activePatientId = null;
    toast(`Consultation complete for ${patient.name}.`, 'success', 'check_circle');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const todayChip = document.querySelector(`#docSmartFilter .sf-chip[onclick*="'today'"]`);
  if (todayChip) {
    sfChipSelect(todayChip, 'doc', 'today');
  } else {
    renderPatientQueue();
  }
});
