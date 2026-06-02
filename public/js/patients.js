'use strict';

HMS.requireAuth();

let db;
let fs;


let allPatients = []; window.allPatients = allPatients;
let filteredPatients = [];
let currentPage = 1;
const ROWS_PER_PAGE = 10;
let activeFilter = 'all';
let sortCol = null, sortDir = 1;

function esc(val) {
  return typeof val === 'string' ? val.replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  }) : (val == null ? '' : String(val));
}

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
      <td><code style="font-size:.78rem;background:var(--surface-mid);padding:2px 6px;border-radius:4px;color:var(--primary-light)">${esc(p.id ? p.id.slice(0,8) : '--')}</code></td>
      <td>
        <div class="patient-cell">
          <div class="mini-avatar">${esc((p.fname||'U')[0])}${esc((p.lname||'')[0])}</div>
          <div>
            <div style="font-weight:700">${esc(p.fname)} ${esc(p.lname)}</div>
            <div style="font-size:.72rem;color:var(--on-surface-var)">${esc(p.age)} yrs · ${esc(p.blood)}</div>
          </div>
        </div>
      </td>
      <td style="font-size:.82rem">${esc(p.contact)}</td>
      <td style="font-size:.82rem">${esc(p.dept)}</td>
      <td style="font-size:.82rem">${formatDate(p.lastVisit)}</td>
      <td><span class="badge-status ${p.status}">${esc(cap(p.status))}</span></td>
      <td>
        <button class="icon-btn" title="View" onclick="viewPatient('${esc(p.id)}')"><span class="material-icons-round">visibility</span></button>
        <button class="icon-btn" title="Edit" onclick="editPatient('${esc(p.id)}')"><span class="material-icons-round">edit</span></button>
        <button class="icon-btn danger" title="Delete" onclick="deletePatient('${esc(p.id)}')"><span class="material-icons-round">delete</span></button>
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
    // Reset filters
    const minAge = document.getElementById('minAgeFilter');
    const maxAge = document.getElementById('maxAgeFilter');
    const place = document.getElementById('placeFilter');
    const doctor = document.getElementById('doctorFilter');
    const op = document.getElementById('opFilter');
    if (minAge) minAge.value = '';
    if (maxAge) maxAge.value = '';
    if (place) place.value = '';
    if (doctor) doctor.value = '';
    if (op) op.value = '';
    applyFilters();
  }
}
window.toggleAdvancedSearchPanel = toggleAdvancedSearchPanel;

function applyFilters() {
  const search = (document.getElementById('patientSearch')?.value || '').toLowerCase();
  const dept = document.getElementById('deptFilter')?.value || '';
  const status = document.getElementById('statusFilter')?.value || '';
  
  // Advanced search parameters
  const minAge = parseInt(document.getElementById('minAgeFilter')?.value) || 0;
  const maxAge = parseInt(document.getElementById('maxAgeFilter')?.value) || 999;
  const place = (document.getElementById('placeFilter')?.value || '').toLowerCase();
  const doctor = (document.getElementById('doctorFilter')?.value || '').toLowerCase();
  const op = (document.getElementById('opFilter')?.value || '').toLowerCase();

  filteredPatients = allPatients.filter(p => {
    const name = `${p.fname} ${p.lname} ${p.id} ${p.contact}`.toLowerCase();
    if (search && !name.includes(search)) return false;
    if (dept && p.dept !== dept) return false;
    if (status && p.status !== status) return false;
    if (activeFilter !== 'all' && p.type !== activeFilter && p.status !== activeFilter) return false;
    
    // Advanced filters
    const age = parseInt(p.age) || 0;
    if (age < minAge || age > maxAge) return false;
    
    const notes = (p.notes || '').toLowerCase();
    if (place && !notes.includes(place)) return false;
    if (doctor && !notes.includes(doctor)) return false;
    if (op && !notes.includes(op)) return false;

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
  renderTable();
}

function filterPatients() { applyFilters(); }

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
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }
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
  const p = allPatients.find(pt => pt.id === id);
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
          <p style="color:var(--on-surface-var);font-size:.85rem">${esc(p.id ? p.id.slice(0,8) : '--')} · ${esc(p.dept)}</p>
          <span class="badge-status ${p.status}" style="margin-top:8px">${esc(cap(p.status))}</span>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group"><label>Age</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.age)} years</div></div>
        <div class="form-group"><label>Blood Group</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.blood)}</div></div>
        <div class="form-group"><label>Contact</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.contact)}</div></div>
        <div class="form-group"><label>Email</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(p.email)}</div></div>
        <div class="form-group"><label>Admission Type</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${esc(cap(p.type))}</div></div>
        <div class="form-group"><label>Last Visit</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">${formatDate(p.lastVisit)}</div></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-secondary" onclick="closeModal(null,'viewPatientModal')">Close</button>
      </div>
    </div>
  `;
  openModal('viewPatientModal');
}

function editPatient(id) {
  const p = allPatients.find(pt => pt.id === id);
  if (!p) { toast('Patient not found', 'error'); return; }
  document.getElementById('editPatientId').value = id;
  document.getElementById('editPatientTitle').textContent = `Edit ${p.fname} ${p.lname}`;
  document.getElementById('editFirstName').value = p.fname || '';
  document.getElementById('editLastName').value = p.lname || '';
  document.getElementById('editDob').value = p.dob || '';
  document.getElementById('editContact').value = p.contact || '';
  document.getElementById('editEmail').value = p.email || '';
  document.getElementById('editDept').value = p.dept || '';
  document.getElementById('editType').value = p.type ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : '';
  document.getElementById('editBlood').value = p.blood || '';
  document.getElementById('editStatus').value = p.status || 'stable';
  document.getElementById('editNotes').value = p.notes || '';
  if (document.getElementById('editGender')) document.getElementById('editGender').value = p.gender || '';
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
    dept: document.getElementById('editDept').value,
    type: document.getElementById('editType').value.toLowerCase(),
    blood: document.getElementById('editBlood').value || 'Unknown',
    dob: document.getElementById('editDob').value,
    gender: document.getElementById('editGender')?.value || '',
    notes: sanitizeInput(document.getElementById('editNotes').value),
    status: document.getElementById('editStatus').value,
  };
  const errors = validatePatientInput(raw);
  if (errors.length > 0) {
    toast(errors.join('. '), 'error');
    return;
  }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';
  try {
    await fs.updateDoc(fs.doc(db, 'patients', id), {
      fname: raw.fname,
      lname: raw.lname,
      contact: raw.contact,
      email: raw.email,
      dept: raw.dept,
      type: raw.type,
      blood: raw.blood,
      dob: raw.dob,
      gender: raw.gender,
      notes: raw.notes,
      status: raw.status,
      age: raw.dob ? Math.floor((new Date() - new Date(raw.dob)) / (365.25 * 24 * 3600 * 1000)) : 0,
      updatedAt: fs.serverTimestamp()
    });
    const idx = allPatients.findIndex(p => p.id === id);
    if (idx !== -1) {
      allPatients[idx] = {
        ...allPatients[idx],
        fname: raw.fname,
        lname: raw.lname,
        contact: raw.contact,
        email: raw.email,
        dept: raw.dept,
        type: raw.type,
        blood: raw.blood,
        dob: raw.dob,
        gender: raw.gender,
        notes: raw.notes,
        status: raw.status,
        age: raw.dob ? Math.floor((new Date() - new Date(raw.dob)) / (365.25 * 24 * 3600 * 1000)) : allPatients[idx].age
      };
      window.allPatients = allPatients;
    }
    closeModal(null, 'editPatientModal');
    applyFilters();
    toast(`Patient ${raw.fname} ${raw.lname} updated!`, 'success');
  } catch (err) {
    toast('Failed to update: ' + err.message, 'error');
  }
  submitBtn.disabled = false;
  submitBtn.textContent = 'Save Changes';
}

async function deletePatient(id) {
  if (!confirm('Remove this patient from the registry?')) return;
  try {
    await fs.deleteDoc(fs.doc(db, 'patients', id));
    allPatients = allPatients.filter(p => p.id !== id);
    window.allPatients = allPatients;
    filteredPatients = filteredPatients.filter(p => p.id !== id);
    applyFilters();
    toast('Patient record removed', 'warning', 'delete');
  } catch (err) {
    toast('Failed to delete: ' + err.message, 'error');
  }
}

async function loadPatients() {
  const tbody = document.getElementById('patientTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--on-surface-var)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">hourglass_empty</span>Loading patients...</td></tr>';
  try {
    const constraints = [fs.orderBy('lastVisit', 'desc')];
    const user = window.HMS ? window.HMS.getUser() : null;
    if (user && user.role === 'Doctor') {
      constraints.unshift(fs.where('doctorId', '==', user.uid));
    }
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'patients'), ...constraints));
    allPatients = [];
    snap.forEach(d => allPatients.push({ id: d.id, ...d.data() }));
    window.allPatients = allPatients;
  } catch (e) {
    console.error('Failed to load patients:', e);
    allPatients = [];
    window.allPatients = allPatients;
  }
  applyFilters();
}

async function submitAddPatient(e) {
  e.preventDefault();
  const raw = {
    fname: sanitizeInput(document.getElementById('pFirstName').value),
    lname: sanitizeInput(document.getElementById('pLastName').value),
    contact: sanitizeInput(document.getElementById('pContact').value),
    email: sanitizeInput(document.getElementById('pEmail').value.trim()),
    dept: document.getElementById('pDept').value,
    type: document.getElementById('pType').value.toLowerCase(),
    blood: document.getElementById('pBlood').value || 'Unknown',
    dob: document.getElementById('pDob').value,
  };
  const errors = validatePatientInput(raw);
  if (errors.length > 0) {
    toast(errors.join('. '), 'error');
    return;
  }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Registering...';
  try {
    const docRef = await fs.addDoc(fs.collection(db, 'patients'), {
      fname: raw.fname,
      lname: raw.lname,
      contact: raw.contact,
      email: raw.email,
      dept: raw.dept,
      type: raw.type,
      blood: raw.blood,
      lastVisit: new Date().toISOString().slice(0, 10),
      status: 'stable',
      age: raw.dob ? Math.floor((new Date() - new Date(raw.dob)) / (365.25 * 24 * 3600 * 1000)) : 0,
      createdAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp()
    });
    const newP = {
      id: docRef.id,
      fname: raw.fname,
      lname: raw.lname,
      contact: raw.contact,
      email: raw.email,
      dept: raw.dept,
      type: raw.type,
      blood: raw.blood,
      status: 'stable',
      age: raw.dob ? Math.floor((new Date() - new Date(raw.dob)) / (365.25 * 24 * 3600 * 1000)) : 0,
      lastVisit: new Date().toISOString().slice(0, 10),
    };
    allPatients.unshift(newP);
    window.allPatients = allPatients;
    applyFilters();
    closeModal(null, 'addPatientModal');
    document.getElementById('addPatientForm').reset();
    toast(`Patient ${newP.fname} ${newP.lname} registered!`, 'success');
  } catch (err) {
    toast('Failed to register patient: ' + err.message, 'error');
  }
  submitBtn.disabled = false;
  submitBtn.textContent = 'Register Patient';
}

document.addEventListener('DOMContentLoaded', () => {
  db = window.firebaseDb;
  fs = window.firebaseFS;
  loadPatients();
});
