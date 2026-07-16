'use strict';

var ORTHO_CACHE_TTL = 5 * 60 * 1000;
var ORTHO_CACHE_KEY = 'hms_ortho_cache_v1';

window.OrthoCache = {
  get: function() {
    try {
      var raw = localStorage.getItem(ORTHO_CACHE_KEY);
      if (!raw) return null;
      var cached = JSON.parse(raw);
      if (Date.now() - cached.timestamp > ORTHO_CACHE_TTL) {
        localStorage.removeItem(ORTHO_CACHE_KEY);
        return null;
      }
      return cached.data;
    } catch(e) {
      localStorage.removeItem(ORTHO_CACHE_KEY);
      return null;
    }
  },
  set: function(data) {
    try {
      localStorage.setItem(ORTHO_CACHE_KEY, JSON.stringify({ data: data, timestamp: Date.now() }));
    } catch(e) {}
  },
  clear: function() {
    try { localStorage.removeItem(ORTHO_CACHE_KEY); } catch(e) {}
  }
};

let allOrthoPatients = []; window.allOrthoPatients = allOrthoPatients;
let filteredOrthoPatients = [];
let orthoCurrentPage = 1;
const ORTHO_ROWS_PER_PAGE = 10;
let orthoSortCol = null, orthoSortDir = 1;
var _orthoInitialized = false;

function getConditionTypeLabel(val) {
  var labels = {
    'fracture': 'Fracture', 'dislocation': 'Dislocation', 'sprain': 'Sprain',
    'strain': 'Strain', 'arthritis': 'Arthritis', 'tendonitis': 'Tendonitis',
    'bursitis': 'Bursitis', 'sciatica': 'Sciatica', 'scoliosis': 'Scoliosis',
    'osteoporosis': 'Osteoporosis', 'herniated_disc': 'Herniated Disc',
    'other': 'Other'
  };
  return labels[val] || val;
}

function orthoFormatDate(d) {
  return d ? new Date(d).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'}) : '';
}

function toggleSelectAllOrtho(cb) {
  document.querySelectorAll('#orthoTableBody input[type="checkbox"]').forEach(c => c.checked = cb.checked);
}

function renderOrthoTable() {
  const tbody = document.getElementById('orthoTableBody');
  if (!tbody) return;
  const start = (orthoCurrentPage - 1) * ORTHO_ROWS_PER_PAGE;
  const pageItems = filteredOrthoPatients.slice(start, start + ORTHO_ROWS_PER_PAGE);
  if (pageItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--on-surface-var)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px;color:var(--outline-var)">search_off</span>No orthopedic patients found</td></tr>';
    return;
  }
  tbody.innerHTML = pageItems.map(p => {
    var oid = p.ortho_id || p.id || '';
    var name = p.patient_name || '';
    var age = p.age || '';
    return '<tr>' +
      '<td data-label=""><input type="checkbox" /></td>' +
      '<td data-label="Ortho ID"><code style="font-size:.78rem;background:var(--surface-mid);padding:2px 6px;border-radius:4px;color:var(--primary-light)">' + esc(oid) + '</code></td>' +
      '<td data-label="Name"><strong>' + esc(name) + '</strong><br><span style="font-size:.72rem;color:var(--on-surface-var)">' + esc(age) + ' yrs</span></td>' +
      '<td data-label="Contact" style="font-size:.82rem">' + esc(p.contact) + '</td>' +
      '<td data-label="Last Visit" style="font-size:.82rem">' + orthoFormatDate(p.last_visit) + '</td>' +
      '<td data-label="Actions">' +
        '<button class="icon-btn" title="View" onclick="viewOrthoPatient(\'' + esc(oid) + '\')"><span class="material-icons-round">visibility</span></button>' +
        '<button class="icon-btn" title="Edit" onclick="editOrthoPatient(\'' + esc(oid) + '\')"><span class="material-icons-round">edit</span></button>' +
        '<button class="icon-btn" title="Add to Ortho OPD" onclick="addOrthoToOpd(this)" data-id="' + esc(oid) + '" data-name="' + esc(name) + '" data-age="' + esc(age) + '" data-gender="' + esc(p.gender || '') + '" data-contact="' + esc(p.contact || '') + '" data-source="ortho"><span class="material-icons-round" style="color:var(--accent-teal, #0891b2)">how_to_reg</span></button>' +
        '<button class="icon-btn danger" title="Delete" onclick="deleteOrthoPatient(\'' + esc(oid) + '\')"><span class="material-icons-round">delete</span></button>' +
      '</td>' +
    '</tr>';
  }).join('');
  updateOrthoPagination();
}

window.addOrthoToOpd = function(btn) {
  if (typeof window.addToOpdRegister === 'function') {
    window.addToOpdRegister(btn);
  } else {
    toast('OPD register not available on this page', 'warning');
  }
};

function validateOrthoInput(data) {
  const errors = [];
  if (!data.patient_name || data.patient_name.trim().length < 1) errors.push('Patient name is required');
  if (data.age && (isNaN(data.age) || data.age < 0 || data.age > 150)) errors.push('Invalid age');
  if (data.contact && data.contact.length > 50) errors.push('Contact too long');
  return errors;
}

function applyOrthoFilters() {
  const search = (document.getElementById('orthoSearch')?.value || '').toLowerCase();

  filteredOrthoPatients = allOrthoPatients.filter(p => {
    const pid = p.ortho_id || p.id || '';
    const name = p.patient_name || '';
    const haystack = (pid + ' ' + name + ' ' + (p.contact || '')).toLowerCase();
    if (search && !haystack.includes(search)) return false;
    return true;
  });

  if (orthoSortCol) {
    filteredOrthoPatients.sort((a, b) => {
      const va = a[orthoSortCol] || '';
      const vb = b[orthoSortCol] || '';
      return va.toString().localeCompare(vb.toString()) * orthoSortDir;
    });
  }
  orthoCurrentPage = 1;
  const countEl = document.getElementById('orthoCount');
  if (countEl) countEl.textContent = filteredOrthoPatients.length;
  renderOrthoTable();
}

function filterOrthoPatients() {
  applyOrthoFilters();
}
window.filterOrthoPatients = filterOrthoPatients;

function updateOrthoPagination() {
  const total = filteredOrthoPatients.length;
  const pages = Math.max(1, Math.ceil(total / ORTHO_ROWS_PER_PAGE));
  const start = (orthoCurrentPage - 1) * ORTHO_ROWS_PER_PAGE + 1;
  const end = Math.min(orthoCurrentPage * ORTHO_ROWS_PER_PAGE, total);
  const infoEl = document.getElementById('orthoPaginationInfo');
  if (infoEl) infoEl.textContent = 'Showing ' + (total ? start : 0) + '–' + end + ' of ' + total;
  const prevEl = document.getElementById('orthoPrevPage');
  const nextEl = document.getElementById('orthoNextPage');
  if (prevEl) prevEl.disabled = orthoCurrentPage <= 1;
  if (nextEl) nextEl.disabled = orthoCurrentPage >= pages;
  const nums = document.getElementById('orthoPageNumbers');
  if (!nums) return;
  nums.innerHTML = '';
  var startPage = Math.max(1, orthoCurrentPage - 2);
  var endPage = Math.min(pages, startPage + 4);
  if (endPage - startPage < 4) startPage = Math.max(1, endPage - 4);
  for (let i = startPage; i <= endPage; i++) {
    const btn = document.createElement('button');
    btn.className = 'page-num' + (i === orthoCurrentPage ? ' active' : '');
    btn.textContent = i;
    btn.onclick = () => { orthoCurrentPage = i; renderOrthoTable(); };
    nums.appendChild(btn);
  }
}

function changeOrthoPage(dir) {
  const pages = Math.ceil(filteredOrthoPatients.length / ORTHO_ROWS_PER_PAGE);
  orthoCurrentPage = Math.max(1, Math.min(pages, orthoCurrentPage + dir));
  renderOrthoTable();
}

function viewOrthoPatient(id) {
  const p = allOrthoPatients.find(pt => (pt.ortho_id || pt.id) == id);
  if (!p) return;
  const titleEl = document.getElementById('viewOrthoTitle');
  if (titleEl) titleEl.textContent = p.patient_name || 'Orthopedic Patient';
  const bodyEl = document.getElementById('viewOrthoBody');
  if (!bodyEl) return;
  bodyEl.innerHTML = '<div style="padding:0 28px 28px">' +
    '<div class="patient-detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
      '<div class="form-group"><label>Ortho ID</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)"><code style="font-size:.85rem;background:var(--surface-mid);padding:2px 6px;border-radius:4px;color:var(--primary-light)">' + esc(p.ortho_id || p.id) + '</code></div></div>' +
      '<div class="form-group"><label>Patient Name</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)"><strong>' + esc(p.patient_name) + '</strong></div></div>' +
      '<div class="form-group"><label>Age</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.age) + ' years</div></div>' +
      '<div class="form-group"><label>Gender</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.gender) + '</div></div>' +
      '<div class="form-group"><label>Contact</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.contact) + '</div></div>' +
      '<div class="form-group"><label>Diagnosis</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.diagnosis) + '</div></div>' +
      '<div class="form-group"><label>Body Part</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(p.body_part) + (p.side ? ' <span style="color:var(--on-surface-var)">(' + esc(p.side) + ')</span>' : '') + '</div></div>' +
      '<div class="form-group"><label>Condition Type</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + esc(getConditionTypeLabel(p.condition_type) || p.condition_type) + '</div></div>' +
      '<div class="form-group"><label>Severity</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)"><span class="badge-status ' + (p.severity || '').toLowerCase() + '">' + esc(p.severity) + '</span></div></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Treatment</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + (p.treatment ? esc(p.treatment) : '<span style="color:var(--outline)">Not specified</span>') + '</div></div>' +
      '<div class="form-group" style="grid-column:1/-1"><label>Notes</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + (p.notes ? esc(p.notes) : '<span style="color:var(--outline)">No notes</span>') + '</div></div>' +
      '<div class="form-group"><label>Registered On</label><div style="padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md)">' + (p.created_on || '—') + '</div></div>' +
    '</div>' +
    '<div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">' +
      '<button class="btn-secondary" onclick="closeModal(null,\'viewOrthoModal\')">Close</button>' +
    '</div>' +
  '</div>';
  openModal('viewOrthoModal');
}

function editOrthoPatient(id) {
  const p = allOrthoPatients.find(pt => (pt.ortho_id || pt.id) == id);
  if (!p) { toast('Orthopedic patient not found', 'error'); return; }
  document.getElementById('editOrthoId').value = p.ortho_id || p.id || '';
  document.getElementById('editOrthoTitle').textContent = 'Edit ' + (p.patient_name || 'Orthopedic Patient');
  document.getElementById('editOrthoPatientName').value = p.patient_name || '';
  document.getElementById('editOrthoAge').value = p.age || '';
  document.getElementById('editOrthoGender').value = p.gender || '';
  document.getElementById('editOrthoContact').value = p.contact || '';
  document.getElementById('editOrthoDiagnosis').value = p.diagnosis || '';
  document.getElementById('editOrthoBodyPart').value = p.body_part || '';
  document.getElementById('editOrthoSide').value = p.side || '';
  document.getElementById('editOrthoConditionType').value = p.condition_type || '';
  document.getElementById('editOrthoSeverity').value = p.severity || 'Mild';
  document.getElementById('editOrthoTreatment').value = p.treatment || '';
  document.getElementById('editOrthoNotes').value = p.notes || '';
  openModal('editOrthoModal');
}

async function submitEditOrthoPatient(e) {
  e.preventDefault();
  const id = document.getElementById('editOrthoId').value;
  const raw = {
    patient_name: document.getElementById('editOrthoPatientName').value.replace(/<[^>]*>/g, '').trim(),
    age: document.getElementById('editOrthoAge').value,
    gender: document.getElementById('editOrthoGender').value,
    contact: document.getElementById('editOrthoContact').value.replace(/<[^>]*>/g, '').trim(),
    diagnosis: document.getElementById('editOrthoDiagnosis').value.replace(/<[^>]*>/g, '').trim(),
    body_part: document.getElementById('editOrthoBodyPart').value,
    side: document.getElementById('editOrthoSide').value,
    condition_type: document.getElementById('editOrthoConditionType').value,
    severity: document.getElementById('editOrthoSeverity').value,
    treatment: document.getElementById('editOrthoTreatment').value.replace(/<[^>]*>/g, '').trim(),
    notes: document.getElementById('editOrthoNotes').value.replace(/<[^>]*>/g, '').trim(),
  };
  const errors = validateOrthoInput({ ortho_id: id, ...raw });
  if (errors.length > 0) { toast(errors.join('. '), 'error'); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, 'Saving...');
  try {
    const result = await window.API.updateOrthopedicPatient(id, raw);
    const idx = allOrthoPatients.findIndex(p => (p.ortho_id || p.id) == id);
    if (idx !== -1) {
      allOrthoPatients[idx] = result.data || raw;
      window.allOrthoPatients = allOrthoPatients;
      OrthoCache.clear();
    }
    closeModal(null, 'editOrthoModal');
    applyOrthoFilters();
    toast('Orthopedic patient updated!', 'success');
  } catch (err) {
    toast('Failed to update: ' + err.message, 'error');
  }
  setButtonIdle(submitBtn);
}

async function deleteOrthoPatient(id) {
  if (!confirm('Remove this orthopedic patient record?')) return;
  try {
    await window.API.deleteOrthopedicPatient(id);
    allOrthoPatients = allOrthoPatients.filter(p => (p.ortho_id || p.id) != id);
    window.allOrthoPatients = allOrthoPatients;
    filteredOrthoPatients = filteredOrthoPatients.filter(p => (p.ortho_id || p.id) != id);
    OrthoCache.clear();
    applyOrthoFilters();
    toast('Orthopedic patient record removed', 'warning', 'delete');
  } catch (err) {
    toast('Failed to delete: ' + err.message, 'error');
  }
}

function refreshOrthoPatients() {
  OrthoCache.clear();
  loadOrthoPatients(true);
}
window.refreshOrthoPatients = refreshOrthoPatients;

async function loadOrthoPatients(skipCache) {
  skipCache = skipCache || false;
  const tbody = document.getElementById('orthoTableBody');
  var hasRenderedCache = false;

  if (!skipCache) {
    var cached = OrthoCache.get();
    if (cached && cached.length > 0) {
      allOrthoPatients = cached;
      window.allOrthoPatients = allOrthoPatients;
      if (_orthoInitialized) applyOrthoFilters();
      hasRenderedCache = true;
    }
  }

  if (!hasRenderedCache && tbody && _orthoInitialized) {
    var skeletonHTML = '';
    for (var i = 0; i < 5; i++) {
      skeletonHTML += '<tr class="skeleton-row">' +
        '<td><div class="skeleton-cell" style="width:20px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:60px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:120px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:90px;"></div></td>' +
        '<td><div class="skeleton-cell" style="width:100px;"></div></td>' +
        '<td><div style="display:flex;gap:6px;">' +
          '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
          '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
          '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
          '<div class="skeleton-cell" style="width:30px;height:30px;border-radius:6px;"></div>' +
        '</div></td>' +
      '</tr>';
    }
    tbody.innerHTML = skeletonHTML;
  }

  try {
    const result = await window.API.getOrthopedicPatients();
    allOrthoPatients = result.data || [];
    window.allOrthoPatients = allOrthoPatients;
    OrthoCache.set(allOrthoPatients);
    if (_orthoInitialized) applyOrthoFilters();
  } catch (e) {
    console.error('Failed to load orthopedic patients:', e);
    if (!hasRenderedCache && _orthoInitialized) {
      if (typeof toast === 'function') toast('Could not load orthopedic patients: ' + (e.message || e), 'error');
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--error,#ef4444)"><span class="material-icons-round" style="display:block;font-size:40px;margin-bottom:8px">error_outline</span>Failed to load<br><button class="btn-secondary" style="margin-top:12px" onclick="loadOrthoPatients()">Retry</button></td></tr>';
      allOrthoPatients = [];
      window.allOrthoPatients = allOrthoPatients;
    }
  }
}
window.loadOrthoPatients = loadOrthoPatients;

function initOrthoPage() {
  if (_orthoInitialized) return;
  _orthoInitialized = true;
  if (allOrthoPatients && allOrthoPatients.length > 0) {
    applyOrthoFilters();
  }
}

function generateNextOrthoId() {
  var existing = {};
  (allOrthoPatients || []).forEach(function(p) {
    existing[String(p.ortho_id || p.id || '')] = true;
  });
  var next = parseInt(localStorage.getItem('hms_ortho_next_id') || '4801', 10);
  if (isNaN(next) || next < 4801) next = 4801;
  while (existing[String(next)]) next++;
  localStorage.setItem('hms_ortho_next_id', String(next + 1));
  return String(next);
}

function openAddOrthoModal() {
  document.getElementById('addOrthoForm').reset();
  try {
    document.getElementById('addOrthoIdDisplay').textContent = generateNextOrthoId();
  } catch(e) {
    if (typeof toast === 'function') toast('Error: ' + e.message, 'error');
  }
  openModal('addOrthoModal');
}
window.openAddOrthoModal = openAddOrthoModal;

async function submitAddOrtho(e) {
  e.preventDefault();
  var orthoId = (document.getElementById('addOrthoIdDisplay').textContent || '').trim();
  const raw = {
    ortho_id: orthoId,
    patient_name: document.getElementById('addOrthoPatientName').value.replace(/<[^>]*>/g, '').trim(),
    age: document.getElementById('addOrthoAge').value,
    gender: document.getElementById('addOrthoGender').value,
    contact: document.getElementById('addOrthoContact').value.replace(/<[^>]*>/g, '').trim(),
    diagnosis: document.getElementById('addOrthoDiagnosis').value.replace(/<[^>]*>/g, '').trim(),
    body_part: document.getElementById('addOrthoBodyPart').value,
    side: document.getElementById('addOrthoSide').value,
    condition_type: document.getElementById('addOrthoConditionType').value,
    severity: document.getElementById('addOrthoSeverity').value,
    treatment: document.getElementById('addOrthoTreatment').value.replace(/<[^>]*>/g, '').trim(),
    notes: document.getElementById('addOrthoNotes').value.replace(/<[^>]*>/g, '').trim(),
  };
  const errors = validateOrthoInput(raw);
  if (errors.length > 0) { toast(errors.join('. '), 'error'); return; }
  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, 'Registering...');
  try {
    const result = await window.API.createOrthopedicPatient(raw);
    const newP = {
      ortho_id: raw.ortho_id,
      id: raw.ortho_id,
      patient_name: raw.patient_name,
      age: raw.age,
      gender: raw.gender,
      contact: raw.contact || '',
      diagnosis: raw.diagnosis,
      body_part: raw.body_part,
      side: raw.side,
      condition_type: raw.condition_type,
      severity: raw.severity || 'Mild',
      treatment: raw.treatment || '',
      notes: raw.notes || '',
      last_visit: new Date().toISOString().slice(0,10),
      created_on: new Date().toISOString().slice(0,10),
    };
    allOrthoPatients.unshift(newP);
    window.allOrthoPatients = allOrthoPatients;
    OrthoCache.clear();
    applyOrthoFilters();
    closeModal(null, 'addOrthoModal');
    document.getElementById('addOrthoForm').reset();
    toast('Orthopedic patient ' + raw.patient_name + ' registered! ID: ' + raw.ortho_id, 'success');
  } catch (err) {
    toast('Failed to register: ' + err.message, 'error');
  }
  setButtonIdle(submitBtn);
}

document.addEventListener('DOMContentLoaded', async () => {
  var isSPA = !!document.getElementById('page-ortho');
  if (!isSPA) _orthoInitialized = true;
  await loadOrthoPatients();
});
