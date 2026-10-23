'use strict';

var CACHE_TTL = 5 * 60 * 1000;
var CACHE_KEY = 'hms_patients_cache_v2';
window._patientsJsVersion = '2026-10-14-f';

window.PatientCache = {
  get: function() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp > CACHE_TTL) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }
      return cached.data;
    } catch(e) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
  },
  set: function(data) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: data, timestamp: Date.now() }));
    } catch(e) {}
  },
  clear: function() {
    try { localStorage.removeItem(CACHE_KEY); } catch(e) {}
  }
};

let allPatients = []; window.allPatients = allPatients;
let filteredPatients = [];
let currentPage = 1;
const ROWS_PER_PAGE = 10;
let activeFilter = 'all';
let sortCol = null, sortDir = 1;
var _patientsInitialized = false;
var _patientsDataLoading = true;


function renderTable() {
  const tbody = document.getElementById('patientTableBody');
  if (!tbody) return;
  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const pageItems = filteredPatients.slice(start, start + ROWS_PER_PAGE);
  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--on-surface-var)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">search_off</span>No patients found</td></tr>';
    return;
  }
  tbody.innerHTML = pageItems.map(p => `
    <tr>
      <td data-label=""><input type="checkbox" /></td>
      <td data-label="Patient ID"><code style="font-size:.78rem;background:var(--surface-mid);padding:2px 6px;border-radius:4px;color:var(--primary-light)">${esc(p.op_no || p.id)}</code></td>
      <td data-label="Name">
        <div class="patient-cell">
          <div class="mini-avatar">${esc((p.fname||'U')[0])}${esc((p.lname||'')[0])}</div>
          <div>
            <div style="font-weight:700">${esc(p.fname)} ${esc(p.lname)}</div>
            <div style="font-size:.72rem;color:var(--on-surface-var)">${esc(p.age)} yrs · ${esc(p.blood_group)} · ${esc(p.doctor)}</div>
          </div>
        </div>
      </td>
      <td data-label="Contact" style="font-size:.82rem">${esc(p.contact)}</td>
      <td data-label="Department" style="font-size:.82rem">${esc(p.department)}</td>
      <td data-label="Doctor" style="font-size:.82rem">${p.doctor ? '<span style="display:inline-flex;align-items:center;gap:4px;"><span class=\"material-icons-round\" style=\"font-size:14px;color:var(--primary-light)\">person</span>' + esc(p.doctor) + '</span>' : '<span style="color:var(--outline)">—</span>'}</td>
      <td data-label="Last Visit" style="font-size:.82rem">${formatDate(p.last_visit)}</td>
      <td data-label="Status"><span class="badge-status ${p.status}">${esc(cap(p.status))}</span></td>
      <td data-label="Actions">
        <button class="icon-btn" title="View" onclick="viewPatient('${esc(p.op_no || p.id)}')"><span class="material-icons-round">visibility</span></button>
        <button class="icon-btn" title="Edit" onclick="editPatient('${esc(p.op_no || p.id)}')"><span class="material-icons-round">edit</span></button>
        <button class="icon-btn" title="Add to OPD"
          onclick="addToOpdRegister(this)"
          data-id="${esc(p.op_no || p.id)}" data-name="${esc(patientFullName(p))}"
          data-age="${p.age}" data-gender="${p.gender}"
          data-blood="${p.blood_group}" data-op="${p.op_no}"
          data-contact="${esc(patientContact(p))}">
          <span class="material-icons-round">how_to_reg</span>
        </button>
        <button class="icon-btn danger" title="Delete" onclick="deletePatient('${esc(p.op_no || p.id)}')"><span class="material-icons-round">delete</span></button>
      </td>
    </tr>
  `).join('');
  updatePagination();
}

function validatePatientInput(data) {
  const errors = [];
  if (!data.fname || data.fname.trim().length < 1) errors.push('First name is required');

  if (data.contact && data.contact.length > 50) errors.push('Contact too long');
  if (data.age && (isNaN(data.age) || data.age < 0 || data.age > 150)) errors.push('Invalid age');
  return errors;
}

function sanitizeInput(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/<[^>]*>/g, '').trim();
}

function formatDate(d) { return d ? new Date(d).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : ''; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function toggleAdvancedSearchPanel() {
  const panel = document.getElementById('advancedSearchPanel');
  const bar = document.querySelector('.filter-bar');
  const btn = document.getElementById('toggleAdvancedSearch');
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    bar.style.borderBottomLeftRadius = '0';
    bar.style.borderBottomRightRadius = '0';
    btn.style.background = 'var(--primary-soft)';
    btn.style.color = 'var(--primary-light)';
  } else {
    panel.style.display = 'none';
    bar.style.borderBottomLeftRadius = '';
    bar.style.borderBottomRightRadius = '';
    btn.style.background = '';
    btn.style.color = '';
    const minAge = document.getElementById('minAgeFilter');
    const maxAge = document.getElementById('maxAgeFilter');
    const place = document.getElementById('placeFilter');
    const doctor = document.getElementById('doctorFilter');
    const op = document.getElementById('opFilter');
    const visitFrom = document.getElementById('visitFromFilter');
    const visitTo = document.getElementById('visitToFilter');
    if (minAge) minAge.value = '';
    if (maxAge) maxAge.value = '';
    if (place) place.value = '';
    if (doctor) doctor.value = '';
    if (op) op.value = '';
    if (visitFrom) visitFrom.value = '';
    if (visitTo) visitTo.value = '';
    updateAdvBadge();
    applyFilters();
  }
}
window.toggleAdvancedSearchPanel = toggleAdvancedSearchPanel;

function updateAdvBadge() {
  let count = 0;
  
  const minAgeVal = document.getElementById('minAgeFilter')?.value;
  if (minAgeVal && parseInt(minAgeVal) > 0) count++;
  
  const maxAgeVal = document.getElementById('maxAgeFilter')?.value;
  if (maxAgeVal && parseInt(maxAgeVal) < 150 && maxAgeVal !== '') count++;
  
  const placeVal = document.getElementById('placeFilter')?.value;
  if (placeVal && placeVal.trim() !== '') count++;
  
  const doctorVal = document.getElementById('doctorFilter')?.value;
  if (doctorVal && doctorVal.trim() !== '') count++;
  
  const opVal = document.getElementById('opFilter')?.value;
  if (opVal && opVal.trim() !== '') count++;
  
  const visitFromVal = document.getElementById('visitFromFilter')?.value;
  if (visitFromVal && visitFromVal !== '') count++;
  
  const visitToVal = document.getElementById('visitToFilter')?.value;
  if (visitToVal && visitToVal !== '') count++;
  
  const badge = document.getElementById('advActiveBadge');
  const clearBtn = document.getElementById('advClearBtn');
  
  if (badge) {
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
  
  if (clearBtn) {
    if (count > 0) {
      clearBtn.style.display = 'inline-flex';
    } else {
      clearBtn.style.display = 'none';
    }
  }
}
window.updateAdvBadge = updateAdvBadge;

function clearAdvancedFilters() {
  const minAge = document.getElementById('minAgeFilter');
  const maxAge = document.getElementById('maxAgeFilter');
  const place = document.getElementById('placeFilter');
  const doctor = document.getElementById('doctorFilter');
  const op = document.getElementById('opFilter');
  const visitFrom = document.getElementById('visitFromFilter');
  const visitTo = document.getElementById('visitToFilter');
  
  if (minAge) minAge.value = '';
  if (maxAge) maxAge.value = '';
  if (place) place.value = '';
  if (doctor) doctor.value = '';
  if (op) op.value = '';
  if (visitFrom) visitFrom.value = '';
  if (visitTo) visitTo.value = '';
  
  updateAdvBadge();
  applyFilters();
}
window.clearAdvancedFilters = clearAdvancedFilters;

function applyFilters() {
  // Single source of truth: other modules (dashboard boot, retries) replace
  // window.allPatients. Rendering from a stale local snapshot is what kept
  // showing "17660 of 17681" after memory already held all 17681.
  if (Array.isArray(window.allPatients) && window.allPatients !== allPatients) {
    allPatients = window.allPatients;
  }
  if (_patientsDataLoading && !allPatients.length) {
    const tbody = document.getElementById('patientTableBody');
    if (tbody && !tbody.querySelector('.skeleton-row')) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--on-surface-var)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--primary-light)">sync</span>Loading patients…</td></tr>';
    }
    return;
  }
  const search = (document.getElementById('patientSearch')?.value || '').toLowerCase();
  const patientId = (document.getElementById('patientIdSearch')?.value || '').toLowerCase();
  const dept = document.getElementById('deptFilter')?.value || '';
  const status = document.getElementById('statusFilter')?.value || '';

  const minAgeVal = document.getElementById('minAgeFilter')?.value;
  const minAge = minAgeVal ? parseInt(minAgeVal) : 0;
  
  const maxAgeVal = document.getElementById('maxAgeFilter')?.value;
  const maxAge = maxAgeVal ? parseInt(maxAgeVal) : 999;
  
  const place = (document.getElementById('placeFilter')?.value || '').toLowerCase();
  const doctor = (document.getElementById('doctorFilter')?.value || '').toLowerCase();
  const op = (document.getElementById('opFilter')?.value || '').toLowerCase();
  const visitFrom = document.getElementById('visitFromFilter')?.value || '';
  const visitTo = document.getElementById('visitToFilter')?.value || '';

  filteredPatients = allPatients.filter(p => {
    // 1. Global Search
    const name = `${p.fname || ''} ${p.lname || ''} ${p.name || ''} ${p.Name || ''} ${p.patient_name || ''} ${p.op_no || p.id || ''} ${p.contact || ''} ${p.doctor || ''}`.toLowerCase();
    if (search && !window.hmsMatchQuery(name, search)) return false;

    // 1b. Patient ID specific search
    if (patientId) {
      const pId = (p.op_no || p.id || '').toString().toLowerCase();
      if (!window.hmsMatchQuery(pId, patientId)) return false;
    }
    
    // 2. Tab chips (All, Admitted, Outpatient, Discharged)
    if (activeFilter === 'admitted' && p.patient_type !== 'admitted') return false;
    if (activeFilter === 'outpatient' && p.patient_type !== 'outpatient') return false;
    if (activeFilter === 'discharged' && p.status !== 'discharged') return false;

    // 3. Select Dropdowns
    if (dept && p.department !== dept) return false;
    if (status && p.status !== status) return false;

    // 4. Advanced Age — ONLY when the user set a bound. The old code applied
    // the 0–999 defaults unconditionally, silently hiding rows whose Age cell
    // holds a date/DOB string (parseInt("2026-05-31…") = 2026 > 999). The
    // default view must show every loaded row.
    if (minAgeVal || maxAgeVal) {
      const age = parseInt(p.age);
      if (!isNaN(age)) {
        if (age < minAge || age > maxAge) return false;
      } else {
        return false;
      }
    }

    // 5. Advanced Place
    if (place) {
      const pPlace = (p.place || p.address || p.Place || p.Address || '').toLowerCase();
      if (!window.hmsMatchQuery(pPlace, place)) return false;
    }

    // 6. Advanced Doctor
    if (doctor) {
      const pDoctor = (p.doctor || p.Doctor || p.doctor_name || p.assignedDoctor || '').toLowerCase();
      if (!window.hmsMatchQuery(pDoctor, doctor)) return false;
    }

    // 7. Advanced OP Number
    if (op) {
      const pOp = (p.op_no || p.id || '').toString().toLowerCase();
      if (!window.hmsMatchQuery(pOp, op)) return false;
    }

    // 8. Advanced Last Visit Date Range
    if (visitFrom || visitTo) {
      let visitDate = null;
      if (p.last_visit) {
        let d = p.last_visit;
        if (d.toDate) d = d.toDate();
        else if (d.seconds) d = new Date(d.seconds * 1000);
        visitDate = new Date(d);
      }
      
      if (!visitDate || isNaN(visitDate.getTime())) {
        return false;
      }

      if (visitFrom) {
        const fromDate = new Date(visitFrom);
        if (!isNaN(fromDate.getTime())) {
          fromDate.setHours(0, 0, 0, 0);
          if (visitDate < fromDate) return false;
        }
      }

      if (visitTo) {
        const toDate = new Date(visitTo);
        if (!isNaN(toDate.getTime())) {
          toDate.setHours(23, 59, 59, 999);
          if (visitDate > toDate) return false;
        }
      }
    }

    return true;
  });

  if (sortCol) {
    filteredPatients.sort((a, b) => {
      const va = a[sortCol] || '';
      const vb = b[sortCol] || '';
      return va.toString().localeCompare(vb.toString()) * sortDir;
    });
  }
  currentPage = 1;
  const countEl = document.getElementById('patientCount');
  if (countEl) {
    // If we know the server holds more than we loaded, say so explicitly
    // instead of silently showing "2632 registered patients".
    var serverTotal = window._patientsServerTotal || 0;
    var noFilterActive = !search && !patientId && !dept && !status && !minAgeVal && !maxAgeVal && !place && !doctor && !op && !visitFrom && !visitTo && activeFilter === 'all';
    if (noFilterActive && serverTotal > filteredPatients.length) {
      try {
        window._patientsRedRender = {
          at: new Date().toISOString(),
          rendered: filteredPatients.length,
          serverTotal: serverTotal,
          closureLen: allPatients.length,
          sharedLen: window.allPatients ? window.allPatients.length : -1
        };
      } catch (e3) {}
      if (window._patientsScanRunning) {
        countEl.textContent = filteredPatients.length + ' of ' + serverTotal + ' (working — ' + window._patientsScanRunning + ')';
        countEl.style.color = '#b45309';
        countEl.title = 'Fetch in progress, please wait…';
        return;
      }
      countEl.innerHTML = '';
      countEl.style.cursor = 'pointer';
      countEl.style.textDecoration = 'underline';
      countEl.style.textUnderlineOffset = '3px';
      countEl.onclick = function (ev) {
        if (ev && ev.target && ev.target.id === 'hmsPatientsDetails') return;
        if (typeof retryMissingPatients === 'function') retryMissingPatients();
      };
      var txt = document.createElement('span');
      txt.textContent = filteredPatients.length + ' of ' + serverTotal + ' (incomplete load — click here to complete) ';
      txt.title = 'Click anywhere on this line to fetch the missing rows';
      var det = document.createElement('a');
      det.href = '#';
      det.textContent = '[details]';
      det.style.color = '#dc2626';
      det.style.textDecoration = 'underline';
      det.style.cursor = 'pointer';
      det.style.fontWeight = '400';
      det.id = 'hmsPatientsDetails';
      det.onclick = function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        if (typeof showPatientsDiag === 'function') showPatientsDiag();
        return false;
      };
      countEl.appendChild(txt);
      countEl.appendChild(det);
      countEl.style.color = '#dc2626';
      var mr = window._patientsMissingRows || [];
      countEl.title = 'Server reports ' + serverTotal + ' but only ' + filteredPatients.length + ' loaded.' +
        (mr.length ? ' Missing sheet rows: ' + mr.join(', ') + '.' : '') + ' Hover rows = exact Sheets row numbers. Click to fetch the missing rows first; if stable, inspect those rows (often blank/deleted rows at the sheet bottom).';
    } else {
      countEl.textContent = filteredPatients.length;
      countEl.style.color = '';
      countEl.style.cursor = '';
      countEl.style.textDecoration = '';
      countEl.title = '';
      countEl.onclick = null;
    }
  }

  const advResultsCount = document.getElementById('advResultsCount');
  if (advResultsCount) {
    if (minAgeVal || maxAgeVal || place || doctor || op || visitFrom || visitTo) {
      advResultsCount.textContent = `(${filteredPatients.length} found)`;
    } else {
      advResultsCount.textContent = '';
    }
  }

  renderTable();
}

function clearOpFilter() {
  var opEl = document.getElementById('opFilter');
  if (opEl && opEl.value.trim()) {
    opEl.value = '';
    if (typeof updateAdvBadge === 'function') updateAdvBadge();
  }
}

function clearIdSearch() {
  var idEl = document.getElementById('patientIdSearch');
  if (idEl && idEl.value) {
    idEl.value = '';
  }
}
window.clearIdSearch = clearIdSearch;

function clearPatientSearch() {
  var searchEl = document.getElementById('patientSearch');
  if (searchEl && searchEl.value) {
    searchEl.value = '';
  }
  var topSearchEl = document.getElementById('patientSearchTopbar');
  if (topSearchEl && topSearchEl.value) {
    topSearchEl.value = '';
  }
}
window.clearPatientSearch = clearPatientSearch;

var _filterDebounceTimer = null;
function filterPatients() {
  clearTimeout(_filterDebounceTimer);
  _filterDebounceTimer = setTimeout(applyFilters, 200);
}
window.filterPatients = filterPatients;

function syncSearch(val) {
  const el = document.getElementById('patientSearch');
  if (el) el.value = val;
  clearOpFilter();
  clearIdSearch();
  filterPatients();
}
window.syncSearch = syncSearch;

function setFilter(btn, filter) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = filter;
  applyFilters();
}
window.setFilter = setFilter;

function sortTable(col) {
  if (sortCol === col) sortDir *= -1;
  else { sortCol = col; sortDir = 1; }
  applyFilters();
}

function toggleSelectAll(cb) {
  document.querySelectorAll('#patientTableBody input[type="checkbox"]').forEach(c => c.checked = cb.checked);
}

function updatePagination() {
  const total = filteredPatients.length;
  const pages = Math.max(1, Math.ceil(total / ROWS_PER_PAGE));
  const start = (currentPage - 1) * ROWS_PER_PAGE + 1;
  const end = Math.min(currentPage * ROWS_PER_PAGE, total);
  const infoEl = document.getElementById('paginationInfo');
  if (infoEl) infoEl.textContent = `Showing ${total ? start : 0}–${end} of ${total}`;
  const prevEl = document.getElementById('prevPage');
  const nextEl = document.getElementById('nextPage');
  if (prevEl) prevEl.disabled = currentPage <= 1;
  if (nextEl) nextEl.disabled = currentPage >= pages;
  const nums = document.getElementById('pageNumbers');
  if (!nums) return;
  nums.innerHTML = '';
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(pages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement('button');
    btn.className = 'page-num' + (i === currentPage ? ' active' : '');
    btn.textContent = i;
    btn.onclick = () => { currentPage = i; renderTable(); };
    nums.appendChild(btn);
  }
}

function changePage(dir) {
  const pages = Math.ceil(filteredPatients.length / ROWS_PER_PAGE);
  currentPage = Math.max(1, Math.min(pages, currentPage + dir));
  renderTable();
}

function _findPatient(id) {
  return allPatients.find(function(pt) { return pt.op_no == id || pt.id == id || pt.contact == id; });
}

function viewPatient(id) {
  const p = _findPatient(id);
  if (!p) return;
  const titleEl = document.getElementById('viewPatientTitle');
  if (titleEl) titleEl.textContent = `${p.fname} ${p.lname}`;
  const bodyEl = document.getElementById('viewPatientBody');
  if (!bodyEl) return;
  bodyEl.innerHTML = `
    <div style="padding:0 28px 28px">
      <div style="display:flex;gap:20px;align-items:flex-start;margin-bottom:24px">
        <div class="mini-avatar" style="width:64px;height:64px;font-size:1.3rem;background:linear-gradient(135deg,var(--primary-light),#2DD4BF);color:#fff">${esc((p.fname||'U')[0])}${esc((p.lname||'')[0])}</div>
        <div>
          <h3 style="font-family:var(--font-head);font-size:1.3rem;font-weight:800">${esc(p.fname)} ${esc(p.lname)}</h3>
          <p style="color:var(--on-surface-var);font-size:.85rem">OP: ${esc(p.op_no || p.id)} · ${esc(p.department)}</p>
          <span class="badge-status ${p.status}" style="margin-top:8px">${esc(cap(p.status))}</span>
        </div>
      </div>
      <div class="patient-detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group"><label>Age</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.age)} years</div></div>
        <div class="form-group"><label>Blood Group</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.blood_group)}</div></div>
        <div class="form-group"><label>Contact</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.contact)}</div></div>
        <div class="form-group"><label>Type</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(cap(p.patient_type))}</div></div>
        <div class="form-group"><label>Last Visit</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${formatDate(p.last_visit)}</div></div>
        <div class="form-group" style="grid-column:1/-1"><label>Place</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${p.address ? esc(p.address) : '<span style="color:var(--outline)">Not specified</span>'}</div></div>
        <div class="form-group" style="grid-column:1/-1"><label>Consulting Doctor</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md);display:flex;align-items:center;gap:8px">${p.doctor ? '<span class="material-icons-round" style="font-size:16px;color:var(--primary-light)">person</span><span style="font-weight:600">' + esc(p.doctor) + '</span>' : '<span style="color:var(--outline)">Not assigned</span>'}</div></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-secondary" onclick="closeModal(null,'viewPatientModal')">Close</button>
      </div>
    </div>
  `;
  openModal('viewPatientModal');
}

function editPatient(id) {
  const p = _findPatient(id);
  if (!p) { toast('Patient not found', 'error'); return; }
  document.getElementById('editPatientId').value = id;
  document.getElementById('editPatientTitle').textContent = `Edit ${p.fname} ${p.lname}`;
  document.getElementById('editFirstName').value = p.fname || '';
  document.getElementById('editLastName').value = p.lname || '';
  document.getElementById('editAge').value = p.age || '';
  document.getElementById('editContact').value = p.contact || '';
  document.getElementById('editDept').value = p.department || '';
  document.getElementById('editType').value = p.patient_type ? cap(p.patient_type) : '';
  document.getElementById('editBlood').value = p.blood_group || '';
  document.getElementById('editStatus').value = p.status || 'Active';
  if (document.getElementById('editGender')) document.getElementById('editGender').value = p.gender || '';
  if (document.getElementById('editNotes')) document.getElementById('editNotes').value = p.notes || '';
  if (document.getElementById('editDoctor')) document.getElementById('editDoctor').value = p.doctor || '';
  if (document.getElementById('editAddress')) document.getElementById('editAddress').value = p.address || '';
  openModal('editPatientModal');
}

async function submitEditPatient(e) {
  e.preventDefault();
  const id = document.getElementById('editPatientId').value;
  const raw = {
    fname: sanitizeInput(document.getElementById('editFirstName').value),
    lname: sanitizeInput(document.getElementById('editLastName').value),
    contact: sanitizeInput(document.getElementById('editContact').value),
    department: document.getElementById('editDept').value,
    patient_type: document.getElementById('editType').value.toLowerCase(),
    blood_group: document.getElementById('editBlood').value || 'Unknown',
    age: document.getElementById('editAge').value,
    gender: document.getElementById('editGender')?.value || '',
    status: document.getElementById('editStatus').value,
    notes: document.getElementById('editNotes')?.value || '',
    doctor: document.getElementById('editDoctor')?.value || '',
    address: document.getElementById('editAddress')?.value || '',
  };
  const errors = validatePatientInput(raw);
  if (errors.length > 0) { toast(errors.join('. '), 'error'); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, 'Saving...');
  try {
    const result = await window.API.updatePatient(id, raw);
    if (!result || result.success === false) {
      throw new Error((result && result.error) || 'Update rejected');
    }
    const idx = allPatients.findIndex(p => p.id == id);
    if (idx !== -1) {
      allPatients[idx] = Object.assign({}, allPatients[idx], raw, result.data || {});
      window.allPatients = allPatients;
      PatientCache.clear();
    }
    closeModal(null, 'editPatientModal');
    applyFilters();
    if (result.offlineQueued) {
      toast('Offline — change queued, will sync when back online', 'warning');
    } else if (result.fallback) {
      toast('Saved to this device only — not synced to the server yet', 'warning');
    } else {
      toast(`Patient updated!`, 'success');
    }
  } catch (err) {
    toast('Failed to update: ' + err.message, 'error');
  }
  setButtonIdle(submitBtn);
}

async function deletePatient(id) {
  const p = _findPatient(id);
  if (!p) { toast('Patient not found', 'error'); return; }
  if (!confirm('Remove ' + (p.fname || '') + ' ' + (p.lname || '') + ' from the registry?')) return;
  try {
    await window.API.deletePatient(id);
    allPatients = allPatients.filter(function(pt) { return pt.id != id && pt.op_no != id; });
    window.allPatients = allPatients;
    filteredPatients = filteredPatients.filter(function(pt) { return pt.id != id && pt.op_no != id; });
    PatientCache.clear();
    applyFilters();
    toast('Patient record removed', 'warning', 'delete');
  } catch (err) {
    toast('Failed to delete: ' + err.message, 'error');
  }
}

function normalizePatients(rawList) {
  return rawList.map(p => {
    let fname = p.fname || p.FirstName || '';
    let lname  = p.lname  || p.LastName  || '';
    if (!fname && !lname) {
      const raw = p.Name || p.name || '';
      const parts = String(raw).trim().split(/\s+/);
      fname = parts[0] || '';
      lname  = parts.slice(1).join(' ');
    }
    const contact = p.contact || p.Phone || p.phone || p.mobile || p.Mobile || '';
    const department = p.department || p.dept || p.Department || '';
    const blood_group = p.blood_group || p.blood || p.Blood ||
                        p['Blood Group'] || p.BloodGroup || 'Unknown';
    const patient_type = p.patient_type || p.type || p.Type || 'Outpatient';
    const status = p.status || p.Status || 'stable';
    const last_visit = p.last_visit || p.lastVisit || p['Last Visit'] ||
                       p.LastVisit || p.date || '';
    const age = p.age || p.Age || '';
    const gender = p.gender || p.Gender || p.Sex || p.sex || '';
    const validOp = function(v) { var n = Number(v); return Number.isInteger(n) && n > 0 && n < 1000000; };
    const op_no = (validOp(p.op_no) && p.op_no) ||
                  (validOp(p['Hosp. OP No']) && p['Hosp. OP No']) ||
                  (validOp(p['OP No']) && p['OP No']) ||
                  (validOp(p['ID. NO']) && p['ID. NO']) ||
                  (validOp(p['ID']) && p['ID']) ||
                  (validOp(p.op) && p.op) || '';
    const doctor = p.doctor || p.Doctor || p.doctor_name || p.assigned_doctor || p['Assigned Doctor'] || p.assignedDoctor || '';
    const address = p.address || p.Address || p.place || p.Place || p['Address'] || '';
    const created_on = p.created_on || p['Created On'] || p.Created_On || p.createdAt || '';
    const id = op_no || p.id || '';
    return { ...p, fname, lname, contact, department, blood_group, patient_type, status, last_visit, age, gender, op_no, id, doctor, address, created_on };
  });
}

function setAddPatientEnabled(enabled) {
  var btn = document.getElementById('addPatientBtn');
  if (btn) btn.disabled = !enabled;
}

function refreshPatients() {
  PatientCache.clear();
  setAddPatientEnabled(false);
  loadPatients(true);
}
window.refreshPatients = refreshPatients;

// No-__row fallback: the deployed backend doesn't stamp rows, so re-read the
// sheet in 1000-row windows and merge by OP number. Logs per-window counts —
// the short window(s) pinpoint the problem area of the sheet.
async function retryMissingPositional(serverTotal, countEl, setStatus) {
  if (!serverTotal || serverTotal <= allPatients.length) { refreshPatients(); return; }
  var B = 1000;
  var pages = Math.ceil(serverTotal / B);
  function rowKey(p) {
    if (p.__row) return 'row:' + p.__row;
    var op = p.op_no || p.id || '';
    return op ? 'op:' + String(op).trim() : null;
  }
  var have = {};
  allPatients.forEach(function (p) { var k = rowKey(p); if (k) have[k] = true; });
  if (typeof toast === 'function') toast('Row map missing — scanning sheet in ' + pages + ' small windows…', 'info');
  if (countEl) countEl.style.opacity = '0.6';
  var added = 0;
  var shortWindows = [];
  window._patientsScanRunning = 'scan 0/' + pages;
  try {
    for (var i = 0; i < pages; i++) {
      window._patientsScanRunning = 'scan ' + (i + 1) + '/' + pages;
      if (countEl) countEl.textContent = allPatients.length + ' of ' + serverTotal + ' (scanning ' + (i + 1) + '/' + pages + '…)';
      var off = i * B, lim = Math.min(B, serverTotal - off);
      var resp = null;
      try {
        resp = window.sheetsFetchDirect
          ? await window.sheetsFetchDirect({ action: 'getPatients', offset: off, limit: lim })
          : await window.API.getPatients({ offset: off, limit: lim });
      } catch (e) { resp = null; }
      if (!resp || resp.offline || resp.fallback || !resp.success) {
        shortWindows.push([off, lim, 'error:' + ((resp && resp.error) || 'fetch_failed')]);
        continue;
      }
      var rows = normalizePatients(resp.data || []);
      if (rows.length < lim) shortWindows.push([off, lim, 'got ' + rows.length]);
      rows.forEach(function (p) {
        var k = rowKey(p);
        if (!k || !have[k]) { allPatients.push(p); added++; if (k) have[k] = true; }
      });
      if (i % 4 === 3 || i === pages - 1) {
        console.warn('HMS: positional scan ' + (i + 1) + '/' + pages + ' added=' + added);
        if (typeof toast === 'function' && i !== pages - 1) toast('Scanning… ' + (i + 1) + '/' + pages, 'info');
      }
    }
    window.allPatients = allPatients;
    console.warn('HMS: positional scan done. added=' + added + ' loaded=' + allPatients.length + '/' + serverTotal +
      ' shortWindows=' + JSON.stringify(shortWindows));
    window._patientsShortWindows = shortWindows;
    window._patientsScanRunning = null;
    try {
      var _uk = {};
      allPatients.forEach(function (p) { var k = rowKey(p); if (k) _uk[k] = true; });
      window._patientsUniqueKeys = Object.keys(_uk).length;
    } catch (euk) {}
    if (countEl) countEl.style.opacity = '';
    if (allPatients.length >= serverTotal) {
      window._patientsServerTotal = allPatients.length;
      window._patientsMissingRows = [];
      try { PatientCache.set(allPatients); } catch (e) {}
      if (typeof toast === 'function') toast('Registry complete: ' + allPatients.length + ' patients', 'success');
      _patientsDataLoading = false;
      applyFilters();
    } else {
      setStatus('Scan added ' + added + ' rows; still ' + allPatients.length + '/' + serverTotal +
        '. Short windows (offset,limit,detail): ' + JSON.stringify(shortWindows) +
        '. Send this + console log to support.');
      if (typeof toast === 'function') toast('Still ' + allPatients.length + ' of ' + serverTotal + ' — click [details], screenshot it', 'warning', null, 8000);
      _patientsDataLoading = false;
      applyFilters();
      if (typeof showPatientsDiag === 'function') showPatientsDiag();
    }
  } catch (e) {
    window._patientsScanRunning = null;
    if (countEl) countEl.style.opacity = '';
    console.error('HMS: positional scan failed', e);
    if (typeof toast === 'function') toast('Scan failed: ' + (e && e.message ? e.message : e), 'error');
  }
}
window.retryMissingPositional = retryMissingPositional;

// Screenshot-able diagnostics for a stuck "17660 of 17681" load.
function showPatientsDiag() {
  var lines = [];
  lines.push('Patient Registry diagnostics');
  lines.push('JS version: ' + (window._patientsJsVersion || 'pre-d'));
  var _loaded = window.allPatients ? window.allPatients.length : 0;
  var _total = window._patientsServerTotal || 0;
  lines.push('Loaded: ' + _loaded + ' / server total: ' + _total +
    (_total && _loaded >= _total ? '  => COMPLETE (red message must be gone)' : '  => INCOMPLETE'));
  try {
    var _hdr = document.getElementById('patientCount');
    lines.push('Header currently shows: "' + (_hdr ? _hdr.textContent : '(no header element)') + '"');
  } catch (eh) {}
  lines.push('Row stamps (__row from server): ' + (window._patientsHasRowStamps ? 'YES' : 'NO — redeploy scripts/Code.gs'));
  lines.push('Last full load: ' + JSON.stringify(window._patientsLastLoad || null));
  lines.push('Last red render: ' + JSON.stringify(window._patientsRedRender || null));
  var _mr = window._patientsMissingRows || [];
  if (_mr.length) lines.push('Missing rows: ' + JSON.stringify(_mr));
  var _sw = window._patientsShortWindows || null;
  if (_sw && _sw.length) lines.push('Scan short windows [offset,limit,detail]: ' + JSON.stringify(_sw));
  if (window._patientsUniqueKeys) lines.push('Unique OP/row keys in memory: ' + window._patientsUniqueKeys);
  if (_sw && !_sw.length && (window._patientsUniqueKeys || 0) < _total) {
    lines.push('NOTE: every window returned FULL data but unique IDs are fewer —');
    lines.push('the sheet itself has duplicate/blank OP numbers. Check the sheet, not the loader.');
  }
  var text = lines.join('\n');
  var ov = document.getElementById('hmsPatientsDiag');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'hmsPatientsDiag';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML =
      '<div style="background:#fff;border-radius:12px;max-width:560px;width:100%;padding:20px;font-family:monospace;">' +
        '<h3 style="font-family:inherit;margin:0 0 10px;font-size:1rem;">Incomplete load — details</h3>' +
        '<textarea id="hmsPatientsDiagText" readonly rows="12" style="width:100%;font-family:monospace;font-size:.75rem;border:1px solid #ddd;border-radius:8px;padding:8px;box-sizing:border-box;"></textarea>' +
        '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">' +
          '<button id="hmsPatientsDiagCopy" style="padding:8px 14px;border-radius:8px;border:1px solid #0d9488;background:#0d9488;color:#fff;cursor:pointer;">Copy</button>' +
          '<button id="hmsPatientsDiagClose" style="padding:8px 14px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;">Close</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.getElementById('hmsPatientsDiagClose').onclick = function () { ov.style.display = 'none'; };
    ov.onclick = function (ev) { if (ev.target === ov) ov.style.display = 'none'; };
    document.getElementById('hmsPatientsDiagCopy').onclick = function () {
      var ta = document.getElementById('hmsPatientsDiagText');
      ta.select();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value);
        else document.execCommand('copy');
      } catch (e) { try { document.execCommand('copy'); } catch (e2) {} }
      if (typeof toast === 'function') toast('Copied — paste it in chat', 'success');
    };
  }
  document.getElementById('hmsPatientsDiagText').value = text;
  ov.style.display = 'flex';
}
window.showPatientsDiag = showPatientsDiag;

// Fast path for "17660 of 17681": fetch ONLY the missing __row ranges
// (one small request per contiguous gap), merge, and re-render. Falls back
// to a full refresh if gaps remain or row stamps are unavailable.
async function retryMissingPatients() {
  if (window._patientsScanRunning) {
    if (typeof toast === 'function') toast('Already working (' + window._patientsScanRunning + ') — please wait…', 'info');
    return;
  }
  var missing = window._patientsMissingRows || [];
  var serverTotal = window._patientsServerTotal || 0;
  var countEl = document.getElementById('patientCount');
  function setStatus(t) { if (countEl) countEl.title = t; }
  var nums = (missing || []).filter(function (r) { return typeof r === 'number'; }).sort(function (a, b) { return a - b; });
  if (!nums.length) {
    // No __row stamps — the deployed Apps Script is older than scripts/Code.gs
    // (it doesn't send __row), so gaps can't be targeted. Fall back to a
    // positional scan: re-read the sheet in small windows and merge by OP no.
    // Small windows also dodge the truncation that caused the short load.
    console.warn('HMS: retryMissingPatients — no row stamps (hasRowStamps=' + window._patientsHasRowStamps +
      '). serverTotal=' + serverTotal + ' loaded=' + allPatients.length +
      ' lastLoad=' + JSON.stringify(window._patientsLastLoad || null));
    return retryMissingPositional(serverTotal, countEl, setStatus);
  }
  // Group "17683,17684,17685" style rows into contiguous ranges.
  var ranges = [];
  var rs = nums[0], pe = nums[0];
  for (var i = 1; i <= nums.length; i++) {
    if (i < nums.length && nums[i] === pe + 1) { pe = nums[i]; continue; }
    ranges.push([rs, pe]);
    if (i < nums.length) { rs = nums[i]; pe = nums[i]; }
  }
  console.warn('HMS: retryMissingPatients fetching ' + nums.length + ' rows in ' + ranges.length +
    ' range(s): ' + JSON.stringify(ranges));
  if (countEl) countEl.style.opacity = '0.6';
  if (typeof toast === 'function') toast('Fetching ' + nums.length + ' missing rows…', 'info');
  try {
    var have = {};
    allPatients.forEach(function (p) { if (p.__row) have[p.__row] = true; });
    var added = 0;
    // Use the direct JSONP reader: window.API.getPatients()'s offline
    // fallback returns the whole cached table (not the window) and its
    // _patientsLoading dedup can hand back the wrong promise — both made
    // the old retry a silent no-op.
    for (var k = 0; k < ranges.length; k++) {
      var off = ranges[k][0] - 2, lim = ranges[k][1] - ranges[k][0] + 1;
      var resp = null;
      if (window.sheetsFetchDirect) {
        resp = await window.sheetsFetchDirect({ action: 'getPatients', offset: off, limit: lim });
      } else if (window.API && window.API.getPatients) {
        resp = await window.API.getPatients({ offset: off, limit: lim });
      }
      if (resp && (resp.offline || resp.fallback)) {
        console.warn('HMS: range ' + ranges[k][0] + '-' + ranges[k][1] + ' got offline fallback — skipping');
        continue;
      }
      var rows = (resp && resp.data) ? normalizePatients(resp.data) : [];
      console.warn('HMS: range ' + ranges[k][0] + '-' + ranges[k][1] + ' (offset ' + off + ' limit ' + lim + ') -> ' + rows.length + ' rows');
      rows.forEach(function (p) {
        if (!p.__row || !have[p.__row]) { allPatients.push(p); added++; if (p.__row) have[p.__row] = true; }
      });
    }
    window.allPatients = allPatients;
    // Recompute gaps
    var still = [];
    if (serverTotal) {
      for (var r = 2; r <= serverTotal + 1; r++) if (!have[r]) { still.push(r); if (still.length >= 50) break; }
    }
    window._patientsMissingRows = still;
    console.warn('HMS: retry done. added=' + added + ' loaded=' + allPatients.length + '/' + serverTotal +
      ' stillMissing=' + JSON.stringify(still));
    if (countEl) countEl.style.opacity = '';
    if (!still.length || allPatients.length >= serverTotal) {
      window._patientsServerTotal = Math.max(serverTotal, allPatients.length);
      try { PatientCache.set(allPatients); } catch (e) {}
      if (typeof toast === 'function') toast('Registry complete: ' + allPatients.length + ' patients', 'success');
    } else {
      setStatus('Fetched ' + added + ' rows, still missing: ' + still.join(', ') + '. Running full refresh…');
      if (typeof toast === 'function') toast('Got ' + added + ', still missing ' + still.length + ' — full refresh…', 'warning');
      refreshPatients();
      return;
    }
    _patientsDataLoading = false;
    applyFilters();
  } catch (e) {
    if (countEl) countEl.style.opacity = '';
    console.error('HMS: retryMissingPatients failed', e);
    if (typeof toast === 'function') toast('Retry failed: ' + (e && e.message ? e.message : e), 'error');
    refreshPatients();
  }
}
window.retryMissingPatients = retryMissingPatients;

async function loadPatients(skipCache) {
  skipCache = skipCache || false;
  _patientsDataLoading = true;

  const tbody = document.getElementById('patientTableBody');
  var hasRenderedCache = false;

  if (!skipCache) {
    var cached = PatientCache.get();
    if (cached && cached.length > 0) {
      allPatients = normalizePatients(cached);
      window.allPatients = allPatients;
      applyFilters();
      hasRenderedCache = true;
      setAddPatientEnabled(true);
    }
  }

  // If we haven't rendered cached data, show the skeleton loader
  if (!hasRenderedCache && tbody) {
    var skeletonHTML = '';
    for (var i = 0; i < 5; i++) {
      skeletonHTML += '<tr class="skeleton-row">' +
        '<td><div class="skeleton-cell" style="width:20px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:60px;"></div></td>' +
        '<td>' +
          '<div style="display:flex;align-items:center;gap:10px;">' +
            '<div class="skeleton-avatar"></div>' +
            '<div style="flex:1;display:flex;flex-direction:column;gap:6px;">' +
              '<div class="skeleton-cell" style="width:120px;"></div>' +
              '<div class="skeleton-cell" style="width:70px;height:10px;"></div>' +
            '</div>' +
          '</div>' +
        '</td>' +
        '<td><div class="skeleton-cell" style="width:90px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:80px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:100px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:100px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:60px;height:22px;border-radius:12px;"></div></td>' +
        '<td>' +
          '<div style="display:flex;gap:6px;">' +
            '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
            '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
            '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }
    tbody.innerHTML = skeletonHTML;
  }

  try {
    const result = await window.API.getPatients();
    allPatients = normalizePatients(result.data || []);
    window.allPatients = allPatients;
    // Only cache COMPLETE loads. Caching a partial 2632 of 17000 is what
    // traps the registry on the wrong number across reloads.
    var serverTotal = (result && (result.total !== undefined ? result.total : result.loaded)) || allPatients.length;
    // Pinpoint EXACT missing sheet rows via the __row stamp (Code.gs).
    // e.g. missingRows=[2644,2645,2646,2647] => check the bottom of the sheet.
    var missingRows = [];
    try {
      var seenRows = {};
      allPatients.forEach(function (p) { if (p.__row) seenRows[p.__row] = true; });
      if (Object.keys(seenRows).length > 0) {
        for (var r = 2; r <= serverTotal + 1; r++) {
          if (!seenRows[r]) {
            missingRows.push(r);
            if (missingRows.length >= 50) { missingRows.push('...'); break; }
          }
        }
      }
    } catch (e) {}
    window._patientsMissingRows = missingRows;
    try {
      window._patientsHasRowStamps = Object.keys(seenRows || {}).length > 0;
      window._patientsSampleRow = allPatients.length ? allPatients[0] : null;
    } catch (e2) {}
    if (result && (result.partial || allPatients.length < serverTotal)) {
      console.error('HMS: PARTIAL LOAD ' + allPatients.length + '/' + serverTotal +
        '. Failed batches: ' + JSON.stringify((result && result.failedBatches) || []) +
        '. Missing sheet rows: ' + JSON.stringify(missingRows));
      if (typeof toast === 'function') toast('Incomplete load: ' + allPatients.length + ' of ' + serverTotal +
        (missingRows.length ? '. Missing sheet rows: ' + missingRows.join(', ') : '') + '. Press Refresh — if it persists, inspect those rows in Sheets.', 'error');
      // Do NOT overwrite good cache with partial data.
    } else {
      // Best-effort cache (17k exceeds localStorage quota — failure is OK,
      // IndexedDB already persisted each batch via persistFetch).
      try { PatientCache.set(allPatients); } catch (e) {}
    }
    if (serverTotal > allPatients.length) {
      window._patientsServerTotal = serverTotal;
    } else {
      window._patientsServerTotal = allPatients.length;
    }
    if (typeof updateExportBadge === 'function') updateExportBadge();
    _patientsDataLoading = false;
    applyFilters();
    setAddPatientEnabled(true);
    if (typeof window.hmsOnPatientsLoaded === 'function') window.hmsOnPatientsLoaded();
    return allPatients;
  } catch (e) {
    console.error('Failed to load patients:', e);
    _patientsDataLoading = false;
    const errMsg = e && e.message ? e.message : String(e);
    if (!hasRenderedCache) {
      if (typeof toast === 'function') toast('Could not load patients: ' + errMsg, 'error');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--error,#ef4444)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px">error_outline</span>Failed to load: ' + errMsg + '<br><button class="btn-secondary" style="margin-top:12px" onclick="loadPatients()">Retry</button></td></tr>';
      allPatients = [];
      window.allPatients = allPatients;
    }
    return allPatients;
  }
}
window.loadPatients = loadPatients;

function initPatientsPage() {
  if (_patientsInitialized) {
    // Re-apply filters every time the tab is revisited
    // so that search typed while loading still works
    applyFilters();
    return;
  }
  _patientsInitialized = true;
  // If data is not yet loaded and not currently loading, kick off load
  if (!allPatients.length && !_patientsDataLoading) {
    loadPatients();
  } else {
    applyFilters();
  }
}


function getNextOpNo() {
  var existing = {};
  (window.allPatients || []).forEach(function(p) {
    var val = p.op_no || p.id || '';
    var num = parseInt(val, 10);
    if (!isNaN(num) && num > 0 && num < 1000000) existing[num] = true;
  });
  var next = 141587;
  while (existing[next]) next++;
  return String(next);
}

function openAddPatientModal() {
  document.getElementById('pOpNo').textContent = getNextOpNo();
  openModal('addPatientModal');
}
window.openAddPatientModal = openAddPatientModal;

async function submitAddPatient(e) {
  e.preventDefault();
  const raw = {
    op_no: document.getElementById('pOpNo').textContent,
    fname: sanitizeInput(document.getElementById('pFirstName').value),
    lname: sanitizeInput(document.getElementById('pLastName').value),
    contact: sanitizeInput(document.getElementById('pContact').value),
    department: document.getElementById('pDept').value,
    patient_type: document.getElementById('pType').value.toLowerCase(),
    blood_group: document.getElementById('pBlood').value || 'Unknown',
    age: document.getElementById('pAge').value,
    notes: document.getElementById('pNotes').value,
    doctor: document.getElementById('pDoctor')?.value || '',
    address: document.getElementById('pAddress')?.value || '',
  };
  const errors = validatePatientInput(raw);
  if (errors.length > 0) { toast(errors.join('. '), 'error'); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, 'Registering...');
  try {
    const result = await window.API.createPatient(raw);
    const resData = (result && result.data) || {};
    const createdId = resData.id || resData.op_no || raw.op_no;
    const newP = normalizePatient({
      id: createdId,
      op_no: createdId,
      fname: raw.fname,
      lname: raw.lname,
      contact: raw.contact || '',
      gender: raw.gender || '',
      age: raw.age || '',
      department: raw.department || 'General',
      blood_group: raw.blood_group || 'Unknown',
      patient_type: raw.patient_type || 'outpatient',
      status: 'stable',
      assigned_doctor: raw.doctor || '',
      notes: raw.notes || '',
      address: raw.address || '',
      last_visit: window.localDateStr(),
      created_on: window.localDateStr(),
    });
    allPatients.unshift(newP);
    window.allPatients = allPatients;
    PatientCache.clear();
    applyFilters();
    if (typeof updateExportBadge === 'function') updateExportBadge();

    // Auto-add to today's OPD
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      const fullName = (raw.fname + ' ' + raw.lname).trim();
      window.API.createAppointment({
        patient_id: newP.op_no || newP.id,
        patient_name: fullName,
        name: fullName,
        age: raw.age,
        doctor_id: raw.doctor || '',
        doctor_name: raw.doctor || '',
        appointment_date: window.localDateStr(),
        appointment_time: timeStr,
        type: 'OPD',
        status: 'waiting',
        reason: raw.notes || ''
      }).then(function(resp) {
        if (resp && resp.error === 'duplicate') return;
        if (typeof OPD_RECORDS !== 'undefined' && OPD_RECORDS !== null && typeof isDuplicateOpdEntry === 'function' && !isDuplicateOpdEntry(newP.op_no || newP.id, 'General', fullName, raw.contact)) {
          OPD_RECORDS.push({
            id: 'OPD-' + Date.now(),
            patient_id: newP.op_no || newP.id,
            name: fullName,
            age: raw.age || 'N/A',
            gender: raw.gender || '',
            contact: raw.contact || '',
            op_no: newP.op_no || newP.id,
            doctor: raw.doctor || 'Unassigned',
            department: 'General',
            complaint: raw.notes || '—',
            time: timeStr,
            timestamp: now.toISOString(),
            created_on: window.localDateStr(),
            _isNew: true
          });
          if (typeof renderOpdRecords === 'function') renderOpdRecords();
          if (typeof updateStats === 'function') updateStats();
        }
      });
    } catch (_e) {
      console.warn('Auto-add to OPD failed:', _e);
    }

    // Increment today's registration count and refresh dashboard KPI
    if (typeof window.bumpServerTodayCountThenRefresh === 'function') {
      window.bumpServerTodayCountThenRefresh();
    } else {
      if (typeof window._serverTodayCount === 'number') window._serverTodayCount++;
      if (typeof updateStats === 'function') updateStats();
    }

    closeModal(null, 'addPatientModal');
    document.getElementById('addPatientForm').reset();
    toast(`Patient ${raw.fname} ${raw.lname} registered! OP No: ${newP.op_no || newP.id}`, 'success');
  } catch (err) {
    toast('Failed to register patient: ' + err.message, 'error');
  }
  setButtonIdle(submitBtn);
}

document.addEventListener('DOMContentLoaded', async () => {
  var isSPA = !!document.getElementById('page-patients');
  if (!isSPA) _patientsInitialized = true;
  window._patientsLoadPromise = loadPatients();
  await window._patientsLoadPromise;
  // Only hide loader if no other controller has claimed ownership (e.g. reception-dashboard)
  if (!window._loaderOwned && typeof window.hideLoader === 'function') window.hideLoader();
  if (typeof window.populateAllDropdowns === 'function') window.populateAllDropdowns();
});
