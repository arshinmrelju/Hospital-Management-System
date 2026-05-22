/* =========================================
   LAB-DASHBOARD.JS
   Pathology Lab Portal Logic
   ========================================= */

'use strict';

let SPECIMENS = [];
let filteredSpecimens = null;

const COMPLETED_RESULTS = [];

let activeSpecimenId = null;
let isScanning = false;

/* --- Render Specimen Queue --- */
function renderSpecimenQueue() {
  const list = document.getElementById('specimenList');
  if (!list) return;

  const icons = {
    'Complete Blood Count': 'bloodtype',
    'Thyroid Profile': 'medication',
    'Kidney Function Test': 'biotech',
    'Blood Glucose': 'water_drop',
    'Lipid Panel': 'monitoring',
    'Liver Function Test': 'medical_services',
    'Urine Routine': 'science',
    'default': 'science'
  };

  const data = filteredSpecimens || SPECIMENS;

  if (data.length === 0) {
    list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--outline);font-size:0.85rem">No specimens found for this time span.</p>';
    const countEl = document.getElementById('specimenCount');
    if (countEl) countEl.textContent = '0 Pending';
    const resultCount = document.getElementById('labResultCount');
    if (resultCount) resultCount.textContent = '0 Pending';
    return;
  }

  list.innerHTML = data.map(spc => `
    <div class="specimen-card ${activeSpecimenId === spc.id ? 'active' : ''}" onclick="selectSpecimen('${spc.id}')" id="spcCard-${spc.id}">
      <div class="specimen-icon">
        <span class="material-icons-round">${icons[spc.test] || icons.default}</span>
      </div>
      <div style="flex:1;min-width:0;">
        <div class="specimen-type">${spc.test}</div>
        <div class="specimen-name">${spc.patient} <span style="font-weight:400;font-size:0.77rem;color:var(--on-surface-var)">· Age ${spc.age}</span></div>
        <div class="specimen-detail">${spc.id} · ${spc.sample} · ${spc.time}</div>
      </div>
      <span class="spec-status ${spc.status}">${spc.critical ? '⚠ ' : ''}${spc.status.charAt(0).toUpperCase() + spc.status.slice(1)}</span>
    </div>
  `).join('');

  const countEl = document.getElementById('specimenCount');
  const pending = data.filter(s => s.status === 'queued').length;
  if (countEl) countEl.textContent = `${pending} Pending`;

  const resultCount = document.getElementById('labResultCount');
  if (resultCount) {
    resultCount.textContent = `${pending} Pending (${data.length} total)`;
  }

  // Populate metrics select
  const sel = document.getElementById('metricsSpecimenSelect');
  if (sel) {
    sel.innerHTML = '<option value="">-- Select Specimen --</option>' +
      data.map(s => `<option value="${s.id}">${s.id} · ${s.patient}</option>`).join('');
  }
}

/* --- Filter Specimen Queue --- */
function filterSpecimenQueue() {
  const startDate = document.getElementById('labStartDate')?.value;
  const startTime = document.getElementById('labStartTime')?.value || '00:00';
  const endDate = document.getElementById('labEndDate')?.value;
  const endTime = document.getElementById('labEndTime')?.value || '23:59';

  if (!startDate) {
    toast('Please select a start date to filter.', 'warning');
    return;
  }

  const startTimestamp = new Date(`${startDate}T${startTime}`).getTime();
  const endTimestamp = endDate 
    ? new Date(`${endDate}T${endTime}`).getTime()
    : new Date(`${startDate}T23:59:59`).getTime();

  filteredSpecimens = SPECIMENS.filter(p => {
    if (!p.timestamp) return false;
    const pTime = new Date(p.timestamp).getTime();
    return pTime >= startTimestamp && pTime <= endTimestamp;
  });

  renderSpecimenQueue();

  // Show result badge
  const badge = document.getElementById('labResultBadge');
  if (badge) badge.classList.add('visible');

  toast(`Found ${filteredSpecimens.length} specimen(s)`, 'info');
}

function clearSpecimenQueueFilter() {
  document.getElementById('labStartDate').value = '';
  document.getElementById('labStartTime').value = '';
  document.getElementById('labEndDate').value = '';
  document.getElementById('labEndTime').value = '';
  filteredSpecimens = null;
  renderSpecimenQueue();

  // Hide result badge
  const badge = document.getElementById('labResultBadge');
  if (badge) badge.classList.remove('visible');

  toast('Filter cleared', 'info');
}

/* --- Render Completed Results --- */
function renderResults() {
  const list = document.getElementById('resultsList');
  if (!list) return;

  list.innerHTML = COMPLETED_RESULTS.map(r => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md);margin-bottom:6px;border:1px solid var(--outline-var);">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="material-icons-round" style="color:${r.status === 'Normal' ? '#059669' : '#d97706'};font-size:20px">${r.status === 'Normal' ? 'check_circle' : 'warning'}</span>
        <div>
          <div style="font-weight:700;font-size:0.85rem;">${r.patient}</div>
          <div style="font-size:0.75rem;color:var(--on-surface-var);">${r.id} · ${r.test} · ${r.time}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <span style="font-size:0.75rem;font-weight:700;padding:3px 8px;border-radius:20px;background:${r.status === 'Normal' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)'};color:${r.status === 'Normal' ? '#059669' : '#d97706'};">${r.status}</span>
        <button onclick="printResult('${r.id}')" style="display:block;margin-top:4px;background:none;border:none;color:var(--primary-light);cursor:pointer;font-size:0.72rem;font-weight:600;">Print ↗</button>
      </div>
    </div>
  `).join('');
}

/* --- Select Specimen --- */
function selectSpecimen(id) {
  activeSpecimenId = id;
  document.querySelectorAll('.specimen-card').forEach(c => {
    c.classList.toggle('active', c.id === `spcCard-${id}`);
  });
  // Pre-fill scanner
  const spc = SPECIMENS.find(s => s.id === id);
  if (spc) {
    document.getElementById('scanSpcId').textContent = spc.id;
    document.getElementById('scanPatient').textContent = spc.patient;
    document.getElementById('scanTestType').textContent = spc.test;
    document.getElementById('scanWBC').textContent = '--';
    document.getElementById('scanRBC').textContent = '--';
    document.getElementById('scanHgb').textContent = '--';
    document.getElementById('scanPlatelet').textContent = '--';
    document.getElementById('scanStatus').textContent = 'READY TO SCAN';
    document.getElementById('scanStatus').className = 'value';
    toast(`Specimen ${spc.id} loaded into scanner.`, 'info', 'document_scanner');
  }
}

/* --- Run Scan (placeholder) --- */
function runScan() {
  toast('Scanner hardware not connected. Please connect a scanner device to use this feature.', 'warning', 'document_scanner');
}

/* --- Clear Scanner --- */
function clearScanner() {
  activeSpecimenId = null;
  document.getElementById('scanSpcId').textContent = '--';
  document.getElementById('scanPatient').textContent = '-- Select specimen --';
  document.getElementById('scanTestType').textContent = '--';
  document.getElementById('scanWBC').textContent = '--';
  document.getElementById('scanRBC').textContent = '--';
  document.getElementById('scanHgb').textContent = '--';
  document.getElementById('scanPlatelet').textContent = '--';
  document.getElementById('scanStatus').textContent = 'STANDBY';
  document.getElementById('scanStatus').className = 'value';
  document.querySelectorAll('.specimen-card').forEach(c => c.classList.remove('active'));
  toast('Scanner cleared.', 'info', 'refresh');
}

/* --- Save Metrics --- */
function saveMetrics() {
  const specId = document.getElementById('metricsSpecimenSelect')?.value;
  if (!specId) { toast('Select a specimen first.', 'warning'); return; }

  const fields = { wbc: 'm_wbc', rbc: 'm_rbc', hgb: 'm_hgb', plt: 'm_plt', glu: 'm_glu', cre: 'm_cre' };
  const vals = {};
  for (const [k, id] of Object.entries(fields)) {
    vals[k] = document.getElementById(id)?.value;
  }

  const spc = SPECIMENS.find(s => s.id === specId);
  if (!spc) return;

  // Color-code range hints
  const ranges = {
    m_wbc: [4, 11], m_rbc: [4.5, 5.5], m_hgb: [13.5, 17.5],
    m_plt: [150, 400], m_glu: [70, 100], m_cre: [0.7, 1.3]
  };
  let hasAlert = false;
  for (const [id, [lo, hi]] of Object.entries(ranges)) {
    const val = parseFloat(document.getElementById(id)?.value);
    const hint = document.getElementById(id)?.parentElement?.querySelector('.range-hint');
    if (val && hint) {
      if (val < lo || val > hi) { hint.className = 'range-hint range-alert'; hasAlert = true; }
      else { hint.className = 'range-hint range-ok'; }
    }
  }

  spc.status = hasAlert ? 'critical' : 'complete';
  renderSpecimenQueue();

  if (!COMPLETED_RESULTS.find(r => r.id === spc.id)) {
    COMPLETED_RESULTS.unshift({
      id: spc.id, patient: spc.patient, test: spc.test,
      status: hasAlert ? 'Elevated' : 'Normal',
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      doctor: spc.doctor
    });
    renderResults();
  }

  toast(hasAlert ? `⚠ Abnormal values detected for ${spc.patient}!` : `Results saved for ${spc.patient}!`, hasAlert ? 'warning' : 'success');
}

/* --- Add Specimen --- */
function addSpecimen() {
  const patient = document.getElementById('newSpcPatient')?.value.trim();
  const test = document.getElementById('newSpcType')?.value;
  const sample = document.getElementById('newSpcSample')?.value;
  const doctor = document.getElementById('newSpcDoctor')?.value.trim() || 'Unknown';
  if (!patient) { toast('Please enter patient name.', 'warning'); return; }

  const newSpc = {
    id: `SPC-${1100 + SPECIMENS.length + 1}`,
    patient, age: 0, test, sample, doctor,
    status: 'queued', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date().toISOString(),
    critical: false
  };
  SPECIMENS.push(newSpc);
  renderSpecimenQueue();
  closeModal(null, 'newSpecimenModal');
  document.getElementById('newSpcPatient').value = '';
  document.getElementById('newSpcDoctor').value = '';
  toast(`Specimen ${newSpc.id} logged for ${patient}!`, 'success', 'science');
}

/* --- Print Result --- */
function printResult(id) {
  toast(`Printing result ${id}...`, 'info', 'print');
  setTimeout(() => toast('Report sent to print queue!', 'success'), 1000);
}

/* --- DOMContentLoaded --- */
document.addEventListener('DOMContentLoaded', () => {
  const todayChip = document.querySelector(`#labSmartFilter .sf-chip[onclick*="'today'"]`);
  if (todayChip) {
    sfChipSelect(todayChip, 'lab', 'today');
  } else {
    renderSpecimenQueue();
  }
  renderResults();
});

