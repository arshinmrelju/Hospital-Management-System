/* =========================================
   LAB.JS
   ========================================= */
'use strict';
HMS.requireAuth();

const LAB_ORDERS = [];
const LAB_RESULTS = [];
const PATIENTS_DB = [];

let labStatusFilter = 'all';

function renderLabTable() {
  const tbody = document.getElementById('labTableBody');
  if (!tbody) return;
  const filtered = LAB_ORDERS.filter(o => labStatusFilter === 'all' || o.status === labStatusFilter);
  tbody.innerHTML = filtered.map(o => `
    <tr>
      <td><code style="background:var(--surface-mid);padding:2px 6px;border-radius:4px;font-size:.78rem;color:var(--primary-light)">${o.id}</code></td>
      <td style="font-weight:600">${o.patient}</td>
      <td>${o.type}</td>
      <td style="font-size:.82rem">${o.doctor}</td>
      <td style="font-size:.82rem">${o.time} · ${o.priority}</td>
      <td><span class="badge-status ${statusClass(o.status)}">${capStatus(o.status)}</span></td>
      <td>
        <button class="icon-btn" onclick="viewLabResult('${o.id}')"><span class="material-icons-round">visibility</span></button>
        ${o.status==='ordered'?`<button class="btn-primary btn-sm" onclick="updateLabStatus('${o.id}','processing')">Start</button>`:''}
        ${o.status==='processing'?`<button class="btn-primary btn-sm" onclick="updateLabStatus('${o.id}','ready')">Complete</button>`:''}
      </td>
    </tr>
  `).join('');
}

function statusClass(s) {
  const m = {ordered:'pending',processing:'recovering',ready:'stable',critical:'critical'};
  return m[s]||'stable';
}
function capStatus(s) { return {ordered:'Ordered',processing:'Processing',ready:'Ready',critical:'Critical'}[s]||s; }

function updateLabStatus(id, newStatus) {
  const o = LAB_ORDERS.find(x => x.id === id);
  if (o) { o.status = newStatus; renderLabTable(); toast(`${id} marked as ${capStatus(newStatus)}`, 'success'); }
}

function filterLabStatus(btn, status) {
  document.querySelectorAll('#tab-lab-orders .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  labStatusFilter = status;
  renderLabTable();
}

function filterLab() {
  const q = (document.getElementById('labSearch')?.value || '').toLowerCase();
  const tbody = document.getElementById('labTableBody');
  if (!tbody) return;
  const filtered = LAB_ORDERS.filter(o =>
    `${o.patient} ${o.type} ${o.doctor} ${o.id}`.toLowerCase().includes(q) &&
    (labStatusFilter === 'all' || o.status === labStatusFilter)
  );
  document.getElementById('labTableBody').innerHTML = filtered.map(o => `
    <tr><td><code style="background:var(--surface-mid);padding:2px 6px;border-radius:4px;font-size:.78rem;color:var(--primary-light)">${o.id}</code></td><td style="font-weight:600">${o.patient}</td><td>${o.type}</td><td style="font-size:.82rem">${o.doctor}</td><td style="font-size:.82rem">${o.time}</td><td><span class="badge-status ${statusClass(o.status)}">${capStatus(o.status)}</span></td><td><button class="icon-btn" onclick="viewLabResult('${o.id}')"><span class="material-icons-round">visibility</span></button></td></tr>
  `).join('');
}

function viewLabResult(id) {
  const r = LAB_RESULTS.find(x => x.id === id);
  if (!r) { toast('Result not available yet', 'warning'); return; }
  document.getElementById('labResultContent').innerHTML = `
    <div style="padding:28px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
        <div>
          <h2 style="font-family:var(--font-head);font-size:1.4rem;font-weight:800">${r.type} Results</h2>
          <p style="color:var(--on-surface-var);font-size:.85rem">${r.patient} · ${r.id}</p>
        </div>
        <button class="modal-close" onclick="closeModal(null,'labResultModal')"><span class="material-icons-round">close</span></button>
      </div>
      <div class="result-values">
        <div style="display:grid;grid-template-columns:2fr 1.5fr 1.5fr 1fr;gap:8px;background:rgba(13,148,136,.06);padding:10px 14px;border-radius:var(--radius-md);font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--on-surface-var)">
          <span>Parameter</span><span>Value</span><span>Reference</span><span>Flag</span>
        </div>
        ${r.values.map(v => `
          <div style="display:grid;grid-template-columns:2fr 1.5fr 1.5fr 1fr;gap:8px;padding:12px 14px;border-bottom:1px solid var(--surface-mid);font-size:.875rem;align-items:center">
            <span style="font-weight:600">${v.name}</span>
            <span style="font-weight:700;color:${v.flag==='high'?'var(--accent-red)':v.flag==='low'?'var(--accent-amber)':'var(--accent-green)'}">${v.val}</span>
            <span style="color:var(--on-surface-var);font-size:.8rem">${v.ref}</span>
            <span class="badge-status ${v.flag==='high'?'critical':v.flag==='low'?'pending':'stable'}">${v.flag}</span>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:20px;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-secondary" onclick="closeModal(null,'labResultModal')">Close</button>
        <button class="btn-primary" onclick="printLabReport('${r.id}')"><span class="material-icons-round">print</span> Print Report</button>
      </div>
    </div>
  `;
  openModal('labResultModal');
}

function renderLabResults() {
  const grid = document.getElementById('labResultsGrid');
  if (!grid) return;
  grid.innerHTML = LAB_RESULTS.map(r => `
    <div class="result-card" onclick="viewLabResult('${r.id}')">
      <div class="result-card-header">
        <div class="result-icon"><span class="material-icons-round">science</span></div>
        <div>
          <h4>${r.type}</h4>
          <div class="patient-name">${r.patient} · ${r.id}</div>
        </div>
      </div>
      <div class="result-values">
        ${r.values.slice(0,3).map(v => `
          <div class="result-row">
            <span class="label">${v.name}</span>
            <span class="value ${v.flag}">${v.val} <span style="font-size:.7rem;opacity:.7">${v.flag}</span></span>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:12px;text-align:right"><span style="font-size:.75rem;color:var(--primary-light);font-weight:600">View full report →</span></div>
    </div>
  `).join('');
}

function renderLabReports() {
  const list = document.getElementById('labReportsList');
  if (!list) return;
  list.innerHTML = LAB_RESULTS.map(r => `
    <div class="report-row">
      <div class="report-icon"><span class="material-icons-round">description</span></div>
      <div class="report-info">
        <strong>${r.type} – ${r.patient}</strong>
        <p>${r.id} · Completed today</p>
      </div>
      <button class="btn-secondary btn-sm" onclick="viewLabResult('${r.id}')"><span class="material-icons-round">visibility</span> View</button>
      <button class="btn-secondary btn-sm" onclick="toast('Downloading report...','info','download')"><span class="material-icons-round">download</span></button>
    </div>
  `).join('');
}

function submitOrderTest(e) {
  e.preventDefault();
  const patient = document.getElementById('labPatient').value;
  const selected = [...document.querySelectorAll('input[name="tests"]:checked')].map(i => i.value);
  if (!selected.length) { toast('Select at least one test', 'warning'); return; }
  selected.forEach(test => {
    LAB_ORDERS.unshift({
      id: `LAB${String(LAB_ORDERS.length+1).padStart(3,'0')}`,
      patient, type: test,
      doctor: document.getElementById('labDoctor').value,
      time: new Date().toTimeString().slice(0,5),
      status: 'ordered',
      priority: document.getElementById('labPriority').value
    });
  });
  renderLabTable();
  closeModal(null,'orderTestModal');
  toast(`${selected.length} test(s) ordered for ${patient}!`, 'success');
}

function printLabReport(id) {
  const r = LAB_RESULTS.find(x => x.id === id);
  if (!r) { toast('Result not found', 'error'); return; }

  const printWindow = window.open('', '_blank');
  
  const html = `
    <html>
      <head>
        <title>Print Report - ${r.patient} (${r.id})</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #1e293b; }
          .header { text-align: center; margin-bottom: 40px; border-bottom: 2px solid #0d9488; padding-bottom: 20px; }
          .header h1 { margin: 0; color: #0d9488; font-size: 28px; font-weight: 800; letter-spacing: -0.5px; }
          .header p { margin: 5px 0 0; color: #64748b; font-size: 14px; }
          .patient-info { display: flex; justify-content: space-between; margin-bottom: 30px; background: #f8fafc; padding: 15px 20px; border-radius: 8px; border: 1px solid #e2e8f0; }
          .patient-info div p { margin: 5px 0; font-size: 14px; }
          .patient-info strong { color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { text-align: left; padding: 12px; background: rgba(13,148,136,0.1); color: #0f172a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #0d9488; }
          td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
          .flag-high { color: #dc2626; font-weight: bold; }
          .flag-low { color: #d97706; font-weight: bold; }
          .flag-normal { color: #059669; }
          .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px;}
          @media print {
            body { padding: 0; }
            .header { margin-top: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Wellness Medicals</h1>
          <p>123 Health Avenue, Medical District • Phone: +1 (555) 123-4567 • Email: info@wellnessmedicals.com</p>
        </div>
        
        <h2 style="margin-top: 0; color: #0f172a;">${r.type} Laboratory Report</h2>
        
        <div class="patient-info">
          <div>
            <p><strong>Patient Name:</strong> ${r.patient}</p>
            <p><strong>Test Type:</strong> ${r.type}</p>
          </div>
          <div style="text-align: right;">
            <p><strong>Report ID:</strong> ${r.id}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Result Value</th>
              <th>Reference Range</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            ${r.values.map(v => `
              <tr>
                <td style="font-weight: 600;">${v.name}</td>
                <td class="flag-${v.flag}">${v.val}</td>
                <td style="color: #64748b;">${v.ref}</td>
                <td class="flag-${v.flag}">${v.flag.toUpperCase()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>*** END OF REPORT ***</p>
          <p>This is a computer-generated document. No signature is required.</p>
        </div>
        <script>
          window.onload = function() { 
            setTimeout(() => {
              window.print(); 
              window.close(); 
            }, 300);
          }
        </script>
      </body>
    </html>
  `;
  
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

/* --- Patient Autocomplete --- */
function initPatientAutocomplete() {
  const input = document.getElementById('labPatient');
  const dropdown = document.getElementById('labPatientDropdown');
  if (!input || !dropdown) return;

  function renderOptions(query = '') {
    const q = query.toLowerCase();
    const filtered = PATIENTS_DB.filter(p => 
      p.name.toLowerCase().includes(q) || p.phone.includes(q)
    );

    if (filtered.length === 0) {
      dropdown.innerHTML = `<div class="autocomplete-item" style="color:var(--on-surface-var); cursor:default;">No patients found.</div>`;
      return;
    }

    dropdown.innerHTML = filtered.map(p => `
      <div class="autocomplete-item" onclick="selectLabPatient('${p.name} - ${p.phone}')">
        <div class="ac-avatar">${p.name.substring(0,2).toUpperCase()}</div>
        <div class="ac-info">
          <span class="ac-name">${p.name}</span>
          <span class="ac-phone">${p.phone}</span>
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
    const wrapper = document.getElementById('labPatientAutocomplete');
    if (wrapper && !wrapper.contains(e.target)) {
      dropdown.classList.remove('active');
    }
  });

  window.selectLabPatient = function(val) {
    input.value = val;
    dropdown.classList.remove('active');
  };
}

document.addEventListener('DOMContentLoaded', () => {
  renderLabTable();
  renderLabResults();
  renderLabReports();
  initPatientAutocomplete();
});
