'use strict';

var SKIN_CACHE_TTL = 5 * 60 * 1000;
var SKIN_CACHE_KEY = 'hms_skin_cache_v1';

window.SkinCache = {
  get: function() {
    try {
      var raw = localStorage.getItem(SKIN_CACHE_KEY);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp > SKIN_CACHE_TTL) {
        localStorage.removeItem(SKIN_CACHE_KEY);
        return null;
      }
      return cached.data;
    } catch(e) {
      localStorage.removeItem(SKIN_CACHE_KEY);
      return null;
    }
  },
  set: function(data) {
    try {
      localStorage.setItem(SKIN_CACHE_KEY, JSON.stringify({ data: data, timestamp: Date.now() }));
    } catch(e) {}
  },
  clear: function() {
    try { localStorage.removeItem(SKIN_CACHE_KEY); } catch(e) {}
  }
};

let allSkinPatients = []; window.allSkinPatients = allSkinPatients;
let filteredSkinPatients = [];
let skinCurrentPage = 1;
const SKIN_ROWS_PER_PAGE = 10;
let skinActiveFilter = 'all';
let skinSortCol = null, skinSortDir = 1;
var _skinInitialized = false;

function getSkinConditionLabel(val) {
  var labels = {
    'acne': 'Acne', 'eczema': 'Eczema', 'psoriasis': 'Psoriasis',
    'rash': 'Rash', 'fungal': 'Fungal Infection', 'vitiligo': 'Vitiligo',
    'dermatitis': 'Dermatitis', 'hives': 'Hives/Urticaria', 'warts': 'Warts',
    'melasma': 'Melasma', 'other': 'Other'
  };
  return labels[val] || val;
}

function renderSkinTable() {
  const tbody = document.getElementById('skinTableBody');
  if (!tbody) return;
  const start = (skinCurrentPage - 1) * SKIN_ROWS_PER_PAGE;
  const pageItems = filteredSkinPatients.slice(start, start + SKIN_ROWS_PER_PAGE);
  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--on-surface-var)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">search_off</span>No skin patients found</td></tr>';
    return;
  }
  tbody.innerHTML = pageItems.map(p => {
    var sid = p.skin_id || p.id || '';
    var name = p.patient_name || '';
    var age = p.age || '';
    var stype = p.skin_type || '';
    var cond = getSkinConditionLabel(p.condition) || p.condition || '';
    var area = p.body_area || '';
    var sev = p.severity || '';
    var sevClass = (sev || '').toLowerCase();
    return '<tr>' +
      '<td data-label="Skin ID"><code style="font-size:.78rem;background:var(--surface-mid);padding:2px 6px;border-radius:4px;color:var(--primary-light)">' + esc(sid) + '</code></td>' +
      '<td data-label="Name"><strong>' + esc(name) + '</strong><br><span style="font-size:.72rem;color:var(--on-surface-var)">' + esc(age) + ' yrs</span></td>' +
      '<td data-label="Skin Type">' + esc(stype) + '</td>' +
      '<td data-label="Condition">' + esc(cond) + '</td>' +
      '<td data-label="Body Area">' + esc(area) + '</td>' +
      '<td data-label="Severity"><span class="badge-status ' + sevClass + '">' + esc(sev) + '</span></td>' +
      '<td data-label="Actions">' +
        '<button class="icon-btn" title="View" onclick="viewSkinPatient(\'' + esc(sid) + '\')"><span class="material-icons-round">visibility</span></button>' +
        '<button class="icon-btn" title="Edit" onclick="editSkinPatient(\'' + esc(sid) + '\')"><span class="material-icons-round">edit</span></button>' +
        '<button class="icon-btn danger" title="Delete" onclick="deleteSkinPatient(\'' + esc(sid) + '\')"><span class="material-icons-round">delete</span></button>' +
      '</td>' +
    '</tr>';
  }).join('');
  updateSkinPagination();
}

function validateSkinInput(data) {
  const errors = [];
  if (!data.skin_id || data.skin_id.trim().length < 1) errors.push('Skin ID is required');
  if (!data.patient_name || data.patient_name.trim().length < 1) errors.push('Patient name is required');
  if (data.age && (isNaN(data.age) || data.age < 0 || data.age > 150)) errors.push('Invalid age');
  if (data.contact && data.contact.length > 50) errors.push('Contact too long');
  return errors;
}

function applySkinFilters() {
  const search = (document.getElementById('skinSearch')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('skinTypeFilter')?.value || '';
  const conditionFilter = document.getElementById('skinConditionFilter')?.value || '';
  const severityFilter = document.getElementById('skinSeverityFilter')?.value || '';

  filteredSkinPatients = allSkinPatients.filter(p => {
    const pid = p.skin_id || p.id || '';
    const name = p.patient_name || '';
    const haystack = (pid + ' ' + name + ' ' + (p.contact || '')).toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (typeFilter && (p.skin_type || '') !== typeFilter) return false;
    if (conditionFilter && (p.condition || '') !== conditionFilter) return false;
    if (severityFilter && (p.severity || '') !== severityFilter) return false;
    return true;
  });

  if (skinSortCol) {
    filteredSkinPatients.sort((a, b) => {
      const va = a[skinSortCol] || '';
      const vb = b[skinSortCol] || '';
      return va.toString().localeCompare(vb.toString()) * skinSortDir;
    });
  }
  skinCurrentPage = 1;
  const countEl = document.getElementById('skinCount');
  if (countEl) countEl.textContent = filteredSkinPatients.length;
  renderSkinTable();
}

function filterSkinPatients() {
  applySkinFilters();
}
window.filterSkinPatients = filterSkinPatients;

function setSkinFilter(btn, filter) {
  document.querySelectorAll('.skin-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  skinActiveFilter = filter;
  applySkinFilters();
}
window.setSkinFilter = setSkinFilter;

function updateSkinPagination() {
  const total = filteredSkinPatients.length;
  const pages = Math.max(1, Math.ceil(total / SKIN_ROWS_PER_PAGE));
  const start = (skinCurrentPage - 1) * SKIN_ROWS_PER_PAGE + 1;
  const end = Math.min(skinCurrentPage * SKIN_ROWS_PER_PAGE, total);
  const infoEl = document.getElementById('skinPaginationInfo');
  if (infoEl) infoEl.textContent = 'Showing ' + (total ? start : 0) + '–' + end + ' of ' + total;
  const prevEl = document.getElementById('skinPrevPage');
  const nextEl = document.getElementById('skinNextPage');
  if (prevEl) prevEl.disabled = skinCurrentPage <= 1;
  if (nextEl) nextEl.disabled = skinCurrentPage >= pages;
  const nums = document.getElementById('skinPageNumbers');
  if (!nums) return;
  nums.innerHTML = '';
  var startPage = Math.max(1, skinCurrentPage - 2);
  var endPage = Math.min(pages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement('button');
    btn.className = 'page-num' + (i === skinCurrentPage ? ' active' : '');
    btn.textContent = i;
    btn.onclick = () => { skinCurrentPage = i; renderSkinTable(); };
    nums.appendChild(btn);
  }
}

function changeSkinPage(dir) {
  const pages = Math.ceil(filteredSkinPatients.length / SKIN_ROWS_PER_PAGE);
  skinCurrentPage = Math.max(1, Math.min(pages, skinCurrentPage + dir));
  renderSkinTable();
}

function viewSkinPatient(id) {
  const p = allSkinPatients.find(pt => (pt.skin_id || pt.id) == id);
  if (!p) return;
  const titleEl = document.getElementById('viewSkinTitle');
  if (titleEl) titleEl.textContent = p.patient_name || 'Skin Patient';
  const bodyEl = document.getElementById('viewSkinBody');
  if (!bodyEl) return;
  bodyEl.innerHTML = '<div style="padding:0 28px 28px">' +
    '<div class="patient-detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
      '<div class="form-group"><label>Skin ID</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)"><code style="font-size:.85rem;background:var(--surface-mid);padding:2px 6px;border-radius:4px;color:var(--primary-light)">' + esc(p.skin_id || p.id) + '</code></div></div>' +
      '<div class="form-group"><label>Patient Name</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)"><strong>' + esc(p.patient_name) + '</strong></div></div>' +
      '<div class="form-group"><label>Age</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.age) + ' years</div></div>' +
      '<div class="form-group"><label>Gender</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.gender) + '</div></div>' +
      '<div class="form-group"><label>Contact</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.contact) + '</div></div>' +
      '<div class="form-group"><label>Skin Type</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.skin_type) + '</div></div>' +
      '<div class="form-group"><label>Condition</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(getSkinConditionLabel(p.condition) || p.condition) + '</div></div>' +
      '<div class="form-group"><label>Body Area</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.body_area) + '</div></div>' +
      '<div class="form-group"><label>Severity</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)"><span class="badge-status ' + (p.severity || '').toLowerCase() + '">' + esc(p.severity) + '</span></div></div>' +
      '<div class="form-group"><label>Allergies</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + (p.allergies ? esc(p.allergies) : '<span style="color:var(--outline)">None</span>') + '</div></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Treatment</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + (p.treatment ? esc(p.treatment) : '<span style="color:var(--outline)">Not specified</span>') + '</div></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Notes</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + (p.notes ? esc(p.notes) : '<span style="color:var(--outline)">No notes</span>') + '</div></div>' +
      '<div class="form-group"><label>Registered On</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + (p.created_on || '—') + '</div></div>' +
    '</div>' +
    '<div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">' +
      '<button class="btn-secondary" onclick="closeModal(null,\'viewSkinModal\')">Close</button>' +
    '</div>' +
  '</div>';
  openModal('viewSkinModal');
}

function editSkinPatient(id) {
  const p = allSkinPatients.find(pt => (pt.skin_id || pt.id) == id);
  if (!p) { toast('Skin patient not found', 'error'); return; }
  document.getElementById('editSkinId').value = p.skin_id || p.id || '';
  document.getElementById('editSkinTitle').textContent = 'Edit ' + (p.patient_name || 'Skin Patient');
  document.getElementById('editSkinPatientName').value = p.patient_name || '';
  document.getElementById('editSkinAge').value = p.age || '';
  document.getElementById('editSkinGender').value = p.gender || '';
  document.getElementById('editSkinContact').value = p.contact || '';
  document.getElementById('editSkinType').value = p.skin_type || '';
  document.getElementById('editSkinCondition').value = p.condition || '';
  document.getElementById('editSkinBodyArea').value = p.body_area || '';
  document.getElementById('editSkinSeverity').value = p.severity || 'Mild';
  document.getElementById('editSkinAllergies').value = p.allergies || '';
  document.getElementById('editSkinTreatment').value = p.treatment || '';
  document.getElementById('editSkinNotes').value = p.notes || '';
  openModal('editSkinModal');
}

async function submitEditSkinPatient(e) {
  e.preventDefault();
  const id = document.getElementById('editSkinId').value;
  const raw = {
    patient_name: document.getElementById('editSkinPatientName').value.replace(/<[^>]*>/g, '').trim(),
    age: document.getElementById('editSkinAge').value,
    gender: document.getElementById('editSkinGender').value,
    contact: document.getElementById('editSkinContact').value.replace(/<[^>]*>/g, '').trim(),
    skin_type: document.getElementById('editSkinType').value,
    condition: document.getElementById('editSkinCondition').value,
    body_area: document.getElementById('editSkinBodyArea').value,
    severity: document.getElementById('editSkinSeverity').value,
    allergies: document.getElementById('editSkinAllergies').value.replace(/<[^>]*>/g, '').trim(),
    treatment: document.getElementById('editSkinTreatment').value.replace(/<[^>]*>/g, '').trim(),
    notes: document.getElementById('editSkinNotes').value.replace(/<[^>]*>/g, '').trim(),
  };
  const errors = validateSkinInput({ skin_id: id, ...raw });
  if (errors.length > 0) { toast(errors.join('. '), 'error'); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, 'Saving...');
  try {
    const result = await window.API.updateSkinPatient(id, raw);
    const idx = allSkinPatients.findIndex(p => (p.skin_id || p.id) == id);
    if (idx !== -1) {
      allSkinPatients[idx] = result.data || raw;
      window.allSkinPatients = allSkinPatients;
      SkinCache.clear();
    }
    closeModal(null, 'editSkinModal');
    applySkinFilters();
    toast('Skin patient updated!', 'success');
  } catch (err) {
    toast('Failed to update: ' + err.message, 'error');
  }
  setButtonIdle(submitBtn);
}

async function deleteSkinPatient(id) {
  if (!confirm('Remove this skin patient record?')) return;
  try {
    await window.API.deleteSkinPatient(id);
    allSkinPatients = allSkinPatients.filter(p => (p.skin_id || p.id) != id);
    window.allSkinPatients = allSkinPatients;
    filteredSkinPatients = filteredSkinPatients.filter(p => (p.skin_id || p.id) != id);
    SkinCache.clear();
    applySkinFilters();
    toast('Skin patient record removed', 'warning', 'delete');
  } catch (err) {
    toast('Failed to delete: ' + err.message, 'error');
  }
}

function refreshSkinPatients() {
  SkinCache.clear();
  loadSkinPatients(true);
}
window.refreshSkinPatients = refreshSkinPatients;

async function loadSkinPatients(skipCache) {
  skipCache = skipCache || false;
  const tbody = document.getElementById('skinTableBody');
  var hasRenderedCache = false;

  if (!skipCache) {
    var cached = SkinCache.get();
    if (cached && cached.length > 0) {
      allSkinPatients = cached;
      window.allSkinPatients = allSkinPatients;
      if (_skinInitialized) applySkinFilters();
      hasRenderedCache = true;
    }
  }

  if (!hasRenderedCache && tbody && _skinInitialized) {
    var skeletonHTML = '';
    for (var i = 0; i < 5; i++) {
      skeletonHTML += '<tr class="skeleton-row">' +
        '<td><div class="skeleton-cell" style="width:60px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:120px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:70px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:80px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:80px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:60px;height:22px;border-radius:12px;"></div></td>' +
        '<td><div style="display:flex;gap:6px;">' +
          '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
          '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
          '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
        '</div></td>' +
      '</tr>';
    }
    tbody.innerHTML = skeletonHTML;
  }

  try {
    const result = await window.API.getSkinPatients();
    allSkinPatients = result.data || [];
    window.allSkinPatients = allSkinPatients;
    SkinCache.set(allSkinPatients);
    if (_skinInitialized) applySkinFilters();
  } catch (e) {
    console.error('Failed to load skin patients:', e);
    if (!hasRenderedCache && _skinInitialized) {
      if (typeof toast === 'function') toast('Could not load skin patients: ' + (e.message || e), 'error');
      if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--error,#ef4444)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px">error_outline</span>Failed to load<br><button class="btn-secondary" style="margin-top:12px" onclick="loadSkinPatients()">Retry</button></td></tr>';
      allSkinPatients = [];
      window.allSkinPatients = allSkinPatients;
    }
  }
}
window.loadSkinPatients = loadSkinPatients;

function initSkinPage() {
  if (_skinInitialized) return;
  _skinInitialized = true;
  if (allSkinPatients && allSkinPatients.length > 0) {
    applySkinFilters();
  }
}

function openAddSkinModal() {
  document.getElementById('addSkinForm').reset();
  openModal('addSkinModal');
}
window.openAddSkinModal = openAddSkinModal;

async function submitAddSkin(e) {
  e.preventDefault();
  const raw = {
    skin_id: document.getElementById('addSkinId').value.replace(/<[^>]*>/g, '').trim(),
    patient_name: document.getElementById('addSkinPatientName').value.replace(/<[^>]*>/g, '').trim(),
    age: document.getElementById('addSkinAge').value,
    gender: document.getElementById('addSkinGender').value,
    contact: document.getElementById('addSkinContact').value.replace(/<[^>]*>/g, '').trim(),
    skin_type: document.getElementById('addSkinType').value,
    condition: document.getElementById('addSkinCondition').value,
    body_area: document.getElementById('addSkinBodyArea').value,
    severity: document.getElementById('addSkinSeverity').value,
    allergies: document.getElementById('addSkinAllergies').value.replace(/<[^>]*>/g, '').trim(),
    treatment: document.getElementById('addSkinTreatment').value.replace(/<[^>]*>/g, '').trim(),
    notes: document.getElementById('addSkinNotes').value.replace(/<[^>]*>/g, '').trim(),
  };
  const errors = validateSkinInput(raw);
  if (errors.length > 0) { toast(errors.join('. '), 'error'); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, 'Registering...');
  try {
    const result = await window.API.createSkinPatient(raw);
    const newP = {
      skin_id: raw.skin_id,
      id: raw.skin_id,
      patient_name: raw.patient_name,
      age: raw.age,
      gender: raw.gender,
      contact: raw.contact || '',
      skin_type: raw.skin_type,
      condition: raw.condition,
      body_area: raw.body_area,
      severity: raw.severity || 'Mild',
      allergies: raw.allergies || '',
      treatment: raw.treatment || '',
      notes: raw.notes || '',
      created_on: new Date().toISOString().slice(0,10),
    };
    allSkinPatients.unshift(newP);
    window.allSkinPatients = allSkinPatients;
    SkinCache.clear();
    applySkinFilters();
    closeModal(null, 'addSkinModal');
    document.getElementById('addSkinForm').reset();
    toast('Skin patient ' + raw.patient_name + ' registered! ID: ' + raw.skin_id, 'success');
  } catch (err) {
    toast('Failed to register: ' + err.message, 'error');
  }
  setButtonIdle(submitBtn);
}

document.addEventListener('DOMContentLoaded', async () => {
  var isSPA = !!document.getElementById('page-skin');
  if (!isSPA) _skinInitialized = true;
  await loadSkinPatients();
  if (typeof window.populateSkinDropdowns === 'function') window.populateSkinDropdowns();
});
