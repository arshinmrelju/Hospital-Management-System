'use strict';

HMS.requireAuth();

let allPatients = [];
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
      <td><code style="font-size:.78rem;background:var(--surface-mid);padding:2px 6px;border-radius:4px;color:var(--primary-light)">${esc(p.id)}</code></td>
      <td>
        <div class="patient-cell">
          <div class="mini-avatar">${esc(p.fname[0]||'')}${esc(p.lname[0]||'')}</div>
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

function applyFilters() {
  const search = (document.getElementById('patientSearch')?.value || '').toLowerCase();
  const dept = document.getElementById('deptFilter')?.value || '';
  const status = document.getElementById('statusFilter')?.value || '';
  filteredPatients = allPatients.filter(p => {
    const name = `${p.fname} ${p.lname} ${p.id}`.toLowerCase();
    if (search && !name.includes(search)) return false;
    if (dept && p.dept !== dept) return false;
    if (status && p.status !== status) return false;
    if (activeFilter !== 'all' && p.type !== activeFilter && p.status !== activeFilter) return false;
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
  for (let i = 1; i <= Math.min(pages, 5); i++) {
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
        <div class="mini-avatar" style="width:64px;height:64px;font-size:1.3rem;background:linear-gradient(135deg,var(--primary-light),#2DD4BF);color:#fff">${esc(p.fname[0]||'')}${esc(p.lname[0]||'')}</div>
        <div>
          <h3 style="font-family:var(--font-head);font-size:1.3rem;font-weight:800">${esc(p.fname)} ${esc(p.lname)}</h3>
          <p style="color:var(--on-surface-var);font-size:.85rem">${esc(p.id)} · ${esc(p.dept)}</p>
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
        <button class="btn-primary" onclick="closeModal(null,'viewPatientModal');toast('Editing ${esc(p.fname)}...','info','edit')">Edit Patient</button>
      </div>
    </div>
  `;
  openModal('viewPatientModal');
}

function editPatient(id) { toast(`Edit mode for ${id}`, 'info', 'edit'); }

function deletePatient(id) {
  if (!confirm('Remove this patient from the registry?')) return;
  allPatients = allPatients.filter(p => p.id !== id);
  filteredPatients = filteredPatients.filter(p => p.id !== id);
  renderTable();
  toast('Patient record removed', 'warning', 'delete');
}

function submitAddPatient(e) {
  e.preventDefault();
  const raw = {
    fname: sanitizeInput(document.getElementById('pFirstName').value),
    lname: sanitizeInput(document.getElementById('pLastName').value),
    contact: sanitizeInput(document.getElementById('pContact').value),
    email: sanitizeInput(document.getElementById('pEmail').value.trim()),
    dept: document.getElementById('pDept').value,
    type: document.getElementById('pType').value.toLowerCase(),
    blood: document.getElementById('pBlood').value || 'Unknown',
    dob: document.getElementById('pDob').value
  };
  const errors = validatePatientInput(raw);
  if (errors.length > 0) {
    toast(errors.join('. '), 'error');
    return;
  }
  const newP = {
    id: `WM-${String(allPatients.length + 1).padStart(3,'0')}`,
    fname: raw.fname,
    lname: raw.lname,
    contact: raw.contact,
    email: raw.email,
    dept: raw.dept,
    type: raw.type,
    blood: raw.blood,
    lastVisit: new Date().toISOString().slice(0,10),
    status: 'stable',
    age: raw.dob ? Math.floor((new Date() - new Date(raw.dob)) / (365.25*24*3600*1000)) : 0,
  };
  allPatients.unshift(newP);
  applyFilters();
  closeModal(null, 'addPatientModal');
  document.getElementById('addPatientForm').reset();
  toast(`Patient ${newP.fname} ${newP.lname} registered!`, 'success');
}

document.addEventListener('DOMContentLoaded', () => {
  renderTable();
});
