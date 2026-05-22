'use strict';

HMS.requireAuth();
const currentUser = HMS.getUser();

if (currentUser && currentUser.role !== 'Admin') {
  toast('Admin access required.', 'error');
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
}

let staffList = JSON.parse(localStorage.getItem('hms_staff_list')) || [];

function saveStaff() {
  localStorage.setItem('hms_staff_list', JSON.stringify(staffList));
}

function esc(val) {
  return typeof val === 'string' ? val.replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  }) : (val == null ? '' : String(val));
}

function sanitize(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/<[^>]*>/g, '').trim();
}

function renderStaffTable(data = staffList) {
  const tbody = document.getElementById('staffTableBody');
  if (!tbody) return;
  tbody.innerHTML = data.map(staff => `
    <tr>
      <td><code>${esc(staff.id)}</code></td>
      <td>
        <div class="staff-info-cell">
          <div class="staff-avatar">${esc((staff.name||'U').split(' ').map(n => n[0]).join('').slice(0, 2))}</div>
          <div class="staff-name-wrap">
            <strong>${esc(staff.name)}</strong>
            <span class="badge-role role-${esc((staff.role||'').toLowerCase())}">${esc(staff.role)}</span>
          </div>
        </div>
      </td>
      <td>${esc(staff.dept)}</td>
      <td>${esc(staff.spec || '--')}</td>
      <td><span class="badge-status ${staff.status.toLowerCase() === 'active' ? 'confirmed' : 'pending'}">${esc(staff.status)}</span></td>
      <td>
        <div style="display: flex; gap: 8px;">
          <button class="btn-icon" onclick="editStaff('${esc(staff.id)}')" title="Edit"><span class="material-icons-round">edit</span></button>
          <button class="btn-icon text-red" onclick="deleteStaff('${esc(staff.id)}')" title="Revoke Access"><span class="material-icons-round">block</span></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function validateStaffInput(data) {
  const errors = [];
  if (!data.name || data.name.trim().length < 2) errors.push('Full name required (min 2 chars)');
  if (!data.role) errors.push('Role is required');
  if (!data.dept) errors.push('Department is required');
  if (!data.username || data.username.trim().length < 3) errors.push('Username required (min 3 chars)');
  return errors;
}

function addStaff(e) {
  e.preventDefault();
  const raw = {
    name: sanitize(document.getElementById('staffName').value),
    role: document.getElementById('staffRole').value,
    dept: sanitize(document.getElementById('staffDept').value),
    spec: sanitize(document.getElementById('staffSpec').value),
    username: sanitize(document.getElementById('staffUsername').value),
  };
  const errors = validateStaffInput(raw);
  if (errors.length > 0) {
    toast(errors.join('. '), 'error');
    return;
  }
  const newStaff = {
    id: `STF${String(staffList.length + 1).padStart(3, '0')}`,
    ...raw,
    status: 'Active',
  };
  staffList.push(newStaff);
  saveStaff();
  renderStaffTable();
  document.getElementById('addStaffModal').classList.remove('active');
  document.getElementById('addStaffOverlay').classList.remove('active');
  document.body.style.overflow = '';
  toast('New staff account created successfully', 'success');
  e.target.reset();
}

function deleteStaff(id) {
  if (confirm(`Are you sure you want to revoke access for ${id}?`)) {
    staffList = staffList.filter(s => s.id !== id);
    saveStaff();
    renderStaffTable();
    toast('Access revoked for the selected staff member', 'warning');
  }
}

function editStaff(id) {
  const staff = staffList.find(s => s.id === id);
  if (!staff) { console.error(`Staff with ID ${id} not found.`); return; }
  document.getElementById('editStaffId').value = staff.id;
  document.getElementById('editStaffName').value = staff.name || '';
  document.getElementById('editStaffRole').value = staff.role || '';
  document.getElementById('editStaffDept').value = staff.dept || '';
  document.getElementById('editStaffSpec').value = staff.spec || '';
  document.getElementById('editStaffStatus').value = staff.status || 'Active';
  document.getElementById('editStaffPhone').value = staff.phone || '';
  document.getElementById('editStaffUsername').value = staff.username || '';
  toggleEditSpecializationField();
  document.getElementById('editStaffModal').classList.add('active');
  document.getElementById('editStaffOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function updateStaff(e) {
  e.preventDefault();
  const id = document.getElementById('editStaffId').value;
  const index = staffList.findIndex(s => s.id === id);
  if (index !== -1) {
    staffList[index] = {
      ...staffList[index],
      name: sanitize(document.getElementById('editStaffName').value),
      role: document.getElementById('editStaffRole').value,
      dept: sanitize(document.getElementById('editStaffDept').value),
      spec: sanitize(document.getElementById('editStaffSpec').value),
      status: document.getElementById('editStaffStatus').value,
      phone: sanitize(document.getElementById('editStaffPhone').value),
      username: sanitize(document.getElementById('editStaffUsername').value),
    };
    saveStaff();
    renderStaffTable();
    document.getElementById('editStaffModal').classList.remove('active');
    document.getElementById('editStaffOverlay').classList.remove('active');
    document.body.style.overflow = '';
    toast('Staff information updated successfully', 'success');
  }
}

function filterStaffTable() {
  const query = (document.getElementById('staffSearch')?.value || '').toLowerCase();
  const role = document.getElementById('roleFilter')?.value;
  const status = document.getElementById('statusFilter')?.value;
  const filtered = staffList.filter(s => {
    const matchesQuery = s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query) || s.username.toLowerCase().includes(query);
    const matchesRole = role === 'all' || s.role === role;
    const matchesStatus = status === 'all' || s.status === status;
    return matchesQuery && matchesRole && matchesStatus;
  });
  renderStaffTable(filtered);
}

function toggleSpecializationField() {
  const role = document.getElementById('staffRole').value;
  document.getElementById('specializationGroup').style.display = (role === 'Doctor' || role === 'Nurse') ? 'block' : 'none';
}

function toggleEditSpecializationField() {
  const role = document.getElementById('editStaffRole').value;
  document.getElementById('editSpecializationGroup').style.display = (role === 'Doctor' || role === 'Nurse') ? 'block' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  renderStaffTable();
  const addForm = document.getElementById('addStaffForm');
  if (addForm) addForm.addEventListener('submit', addStaff);
  const editForm = document.getElementById('editStaffForm');
  if (editForm) editForm.addEventListener('submit', updateStaff);
  toggleSpecializationField();
});
