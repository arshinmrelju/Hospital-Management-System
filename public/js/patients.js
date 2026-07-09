'use strict';

var CACHE_TTL = 5 * 60 * 1000;
var CACHE_KEY = 'hms_patients_cache';

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


function renderTable() {
  const tbody = document.getElementById('patientTableBody');
  if (!tbody) return;
  const start = (currentPage - 1) * ROWS_PER_PAGE;
  const pageItems = filteredPatients.slice(start, start + ROWS_PER_PAGE);
  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--on-surface-var)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">search_off</span>No patients found</td></tr>';
    return;
  }
  tbody.innerHTML = pageItems.map(p => `
    <tr>
      <td><input type="checkbox" /></td>
      <td><code style="font-size:.78rem;background:var(--surface-mid);padding:2px 6px;border-radius:4px;color:var(--primary-light)">${esc(p.op_no || p.id)}</code></td>
      <td>
        <div class="patient-cell">
          <div class="mini-avatar">${esc((p.fname||'U')[0])}${esc((p.lname||'')[0])}</div>
          <div>
            <div style="font-weight:700">${esc(p.fname)} ${esc(p.lname)}</div>
            <div style="font-size:.72rem;color:var(--on-surface-var)">${esc(p.age)} yrs · ${esc(p.blood_group)}</div>
          </div>
        </div>
      </td>
      <td style="font-size:.82rem">${esc(p.contact)}</td>
      <td style="font-size:.82rem">${esc(p.department)}</td>
      <td style="font-size:.82rem">${formatDate(p.last_visit)}</td>
      <td><span class="badge-status ${p.status}">${esc(cap(p.status))}</span></td>
      <td>
        <button class="icon-btn" title="View" onclick="viewPatient(${p.id})"><span class="material-icons-round">visibility</span></button>
        <button class="icon-btn" title="Edit" onclick="editPatient(${p.id})"><span class="material-icons-round">edit</span></button>
        <button class="icon-btn danger" title="Delete" onclick="deletePatient(${p.id})"><span class="material-icons-round">delete</span></button>
      </td>
    </tr>
  `).join('');
  updatePagination();
}

function validatePatientInput(data) {
  const errors = [];
  if (!data.fname || data.fname.trim().length < 1) errors.push('First name is required');
  if (!data.lname || data.lname.trim().length < 1) errors.push('Last name is required');
  if (data.contact && data.contact.length > 50) errors.push('Contact too long');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Invalid email format');
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
  const search = (document.getElementById('patientSearch')?.value || '').toLowerCase();
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
    const name = `${p.fname} ${p.lname} ${p.op_no || p.id} ${p.contact} ${p.doctor || ''}`.toLowerCase();
    if (search && !name.includes(search)) return false;
    
    // 2. Tab chips (All, Admitted, Outpatient, Discharged)
    if (activeFilter === 'admitted' && p.patient_type !== 'admitted') return false;
    if (activeFilter === 'outpatient' && p.patient_type !== 'outpatient') return false;
    if (activeFilter === 'discharged' && p.status !== 'discharged') return false;

    // 3. Select Dropdowns
    if (dept && p.department !== dept) return false;
    if (status && p.status !== status) return false;

    // 4. Advanced Age
    const age = parseInt(p.age);
    if (!isNaN(age)) {
      if (age < minAge || age > maxAge) return false;
    } else if (minAgeVal || maxAgeVal) {
      return false;
    }

    // 5. Advanced Place
    if (place) {
      const pPlace = (p.place || p.address || p.Place || p.Address || '').toLowerCase();
      if (!pPlace.includes(place)) return false;
    }

    // 6. Advanced Doctor
    if (doctor) {
      const pDoctor = (p.doctor || p.Doctor || p.doctor_name || p.assignedDoctor || '').toLowerCase();
      if (!pDoctor.includes(doctor)) return false;
    }

    // 7. Advanced OP Number
    if (op) {
      const pOp = (p.op_no || p.id || '').toString().toLowerCase();
      if (!pOp.includes(op)) return false;
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
  if (countEl) countEl.textContent = filteredPatients.length;

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

function filterPatients() {
  applyFilters();
}
window.filterPatients = filterPatients;

function syncSearch(val) {
  const el = document.getElementById('patientSearch');
  if (el) el.value = val;
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

function viewPatient(id) {
  const p = allPatients.find(pt => pt.id == id);
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
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group"><label>Age</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.age)} years</div></div>
        <div class="form-group"><label>Blood Group</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.blood_group)}</div></div>
        <div class="form-group"><label>Contact</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.contact)}</div></div>
        <div class="form-group"><label>Email</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.email)}</div></div>
        <div class="form-group"><label>Type</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(cap(p.patient_type))}</div></div>
        <div class="form-group"><label>Last Visit</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${formatDate(p.last_visit)}</div></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-secondary" onclick="closeModal(null,'viewPatientModal')">Close</button>
      </div>
    </div>
  `;
  openModal('viewPatientModal');
}

function editPatient(id) {
  const p = allPatients.find(pt => pt.id == id);
  if (!p) { toast('Patient not found', 'error'); return; }
  document.getElementById('editPatientId').value = id;
  document.getElementById('editPatientTitle').textContent = `Edit ${p.fname} ${p.lname}`;
  document.getElementById('editFirstName').value = p.fname || '';
  document.getElementById('editLastName').value = p.lname || '';
  document.getElementById('editDob').value = p.dob ? p.dob.slice(0,10) : '';
  document.getElementById('editContact').value = p.contact || '';
  document.getElementById('editEmail').value = p.email || '';
  document.getElementById('editDept').value = p.department || '';
  document.getElementById('editType').value = p.patient_type ? cap(p.patient_type) : '';
  document.getElementById('editBlood').value = p.blood_group || '';
  document.getElementById('editStatus').value = p.status || 'Active';
  if (document.getElementById('editGender')) document.getElementById('editGender').value = p.gender || '';
  if (document.getElementById('editNotes')) document.getElementById('editNotes').value = p.notes || '';
  openModal('editPatientModal');
}

async function submitEditPatient(e) {
  e.preventDefault();
  const id = document.getElementById('editPatientId').value;
  const raw = {
    fname: sanitizeInput(document.getElementById('editFirstName').value),
    lname: sanitizeInput(document.getElementById('editLastName').value),
    contact: sanitizeInput(document.getElementById('editContact').value),
    email: sanitizeInput(document.getElementById('editEmail').value.trim()),
    department: document.getElementById('editDept').value,
    patient_type: document.getElementById('editType').value.toLowerCase(),
    blood_group: document.getElementById('editBlood').value || 'Unknown',
    dob: document.getElementById('editDob').value,
    gender: document.getElementById('editGender')?.value || '',
    status: document.getElementById('editStatus').value,
    notes: document.getElementById('editNotes')?.value || '',
  };
  const errors = validatePatientInput(raw);
  if (errors.length > 0) { toast(errors.join('. '), 'error'); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';
  try {
    const result = await window.API.updatePatient(id, raw);
    const idx = allPatients.findIndex(p => p.id == id);
    if (idx !== -1) {
      allPatients[idx] = result.data;
      window.allPatients = allPatients;
      PatientCache.clear();
    }
    closeModal(null, 'editPatientModal');
    applyFilters();
    toast(`Patient updated!`, 'success');
  } catch (err) {
    toast('Failed to update: ' + err.message, 'error');
  }
  submitBtn.disabled = false;
  submitBtn.textContent = 'Save Changes';
}

async function deletePatient(id) {
  if (!confirm('Remove this patient from the registry?')) return;
  try {
    await window.API.deletePatient(id);
    allPatients = allPatients.filter(p => p.id != id);
    window.allPatients = allPatients;
    filteredPatients = filteredPatients.filter(p => p.id != id);
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
    let age = p.age || p.Age || '';
    if (!age && (p.dob || p.DOB)) {
      const dob = new Date(p.dob || p.DOB);
      if (!isNaN(dob.getTime()))
        age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
    }
    const gender = p.gender || p.Gender || p.Sex || p.sex || '';
    const op_no = p.op_no || p['Hosp. OP No'] || p['OP No'] ||
                  p['ID. NO'] || p['ID'] || p.op || '';
    const doctor = p.doctor || p.Doctor || p.doctor_name || '';
    const email = p.email || p.Email || '';
    return { ...p, fname, lname, contact, department, blood_group, patient_type, status, last_visit, age, gender, op_no, doctor, email };
  });
}

function refreshPatients() {
  PatientCache.clear();
  loadPatients(true);
}
window.refreshPatients = refreshPatients;

async function loadPatients(skipCache) {
  skipCache = skipCache || false;

  const tbody = document.getElementById('patientTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--on-surface-var)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">hourglass_empty</span>Loading patients...</td></tr>';

  try {
    if (!skipCache) {
      var cached = PatientCache.get();
      if (cached) {
        allPatients = normalizePatients(cached);
        window.allPatients = allPatients;
        applyFilters();
        return;
      }
    }

    const result = await window.API.getPatients();
    allPatients = normalizePatients(result.data || []);
    window.allPatients = allPatients;
    PatientCache.set(allPatients);
  } catch (e) {
    console.error('Failed to load patients:', e);
    const errMsg = e && e.message ? e.message : String(e);
    if (typeof toast === 'function') toast('Could not load patients: ' + errMsg, 'error');
    const tbody2 = document.getElementById('patientTableBody');
    if (tbody2) tbody2.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--error,#ef4444)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px">error_outline</span>Failed to load: ' + errMsg + '<br><button class="btn-secondary" style="margin-top:12px" onclick="loadPatients()">Retry</button></td></tr>';
    allPatients = [];
    window.allPatients = allPatients;
  }

  applyFilters();
}
window.loadPatients = loadPatients;


function getNextOpNo() {
  var maxOp = 0;
  (window.allPatients || []).forEach(function(p) {
    var num = parseInt(p.op_no || p.id, 10);
    if (!isNaN(num) && num > maxOp) maxOp = num;
  });
  return String(maxOp + 1);
}

function openAddPatientModal() {
  document.getElementById('pOpNo').textContent = getNextOpNo();
  openModal('addPatientModal');
}
window.openAddPatientModal = openAddPatientModal;

async function submitAddPatient(e) {
  e.preventDefault();
  const raw = {
    fname: sanitizeInput(document.getElementById('pFirstName').value),
    lname: sanitizeInput(document.getElementById('pLastName').value),
    contact: sanitizeInput(document.getElementById('pContact').value),
    email: sanitizeInput(document.getElementById('pEmail').value.trim()),
    department: document.getElementById('pDept').value,
    patient_type: document.getElementById('pType').value.toLowerCase(),
    blood_group: document.getElementById('pBlood').value || 'Unknown',
    dob: document.getElementById('pDob').value,
    notes: document.getElementById('pNotes').value,
  };
  const errors = validatePatientInput(raw);
  if (errors.length > 0) { toast(errors.join('. '), 'error'); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Registering...';
  try {
    const result = await window.API.createPatient(raw);
    const newP = result.data;
    allPatients.unshift(newP);
    window.allPatients = allPatients;
    PatientCache.clear();
    applyFilters();
    closeModal(null, 'addPatientModal');
    document.getElementById('addPatientForm').reset();
    toast(`Patient ${raw.fname} ${raw.lname} registered! OP No: ${newP.op_no || newP.id}`, 'success');
  } catch (err) {
    toast('Failed to register patient: ' + err.message, 'error');
  }
  submitBtn.disabled = false;
  submitBtn.textContent = 'Register Patient';
}

document.addEventListener('DOMContentLoaded', () => {
  loadPatients();
});
