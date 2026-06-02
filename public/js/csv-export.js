'use strict';

HMS.requireAuth();

// ===== CSV UTILITY =====
function csvEscape(val) {
  if (val == null) return '';
  var s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(values) {
  return values.map(csvEscape).join(',') + '\n';
}

function downloadCSV(filename, headers, rows) {
  var bom = '\uFEFF';
  var csv = bom + csvRow(headers) + rows.map(csvRow).join('');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename.replace(/\s+/g, '_').toLowerCase() + '.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function dateInput(d) {
  if (!d) return '';
  if (d.toDate) d = d.toDate();
  if (typeof d === 'string') d = new Date(d);
  if (!(d instanceof Date) || isNaN(d)) return '';
  return d.toISOString().split('T')[0];
}

function formatDateTime(d) {
  if (!d) return '';
  if (d.toDate) d = d.toDate();
  if (typeof d === 'string') d = new Date(d);
  if (!(d instanceof Date) || isNaN(d)) return '';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ===== FILTER HELPERS =====
function toggleFilters(type) {
  var el = document.getElementById('filters-' + type);
  if (el) el.classList.toggle('open');
}
window.toggleFilters = toggleFilters;

function clearFilters(type) {
  var prefix = 'filter-' + type + '-';
  document.querySelectorAll('[id^="' + CSS.escape(prefix) + '"]').forEach(function(el) {
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') el.value = '';
  });
  toast('Filters cleared for ' + type, 'info');
}
window.clearFilters = clearFilters;

function getFilterVal(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function inDateRange(dateField, fromId, toId) {
  var fromVal = getFilterVal(fromId);
  var toVal = getFilterVal(toId);
  if (!fromVal && !toVal) return true;
  var d = dateField;
  if (!d) return !fromVal && !toVal;
  if (d.toDate) d = d.toDate();
  if (typeof d === 'string') d = new Date(d);
  if (!(d instanceof Date) || isNaN(d)) return !fromVal && !toVal;
  var ts = d.getTime();
  if (fromVal) { var f = new Date(fromVal).getTime(); if (ts < f) return false; }
  if (toVal) { var t = new Date(toVal).getTime() + 86400000; if (ts >= t) return false; }
  return true;
}

// ===== EXPORT FUNCTIONS =====
async function exportCSV(type) {
  toast('Preparing ' + type + ' export...', 'info');
  try {
    var db = window.firebaseDb;
    var fs = window.firebaseFS;
    switch (type) {
      case 'patients': await exportPatients(db, fs); break;
      case 'appointments': await exportAppointments(db, fs); break;
      case 'inventory': await exportInventory(db, fs); break;
      case 'lab': await exportLab(db, fs); break;
      case 'transactions': await exportTransactions(db, fs); break;
      case 'doctors': await exportDoctors(db, fs); break;
      default: toast('Unknown export type', 'error');
    }
  } catch (e) {
    console.error('Export failed:', e);
    toast('Export failed: ' + e.message, 'error');
  }
}
window.exportCSV = exportCSV;

async function exportPatients(db, fs) {
  var statusFilter = getFilterVal('filter-patients-status');
  var deptFilter = getFilterVal('filter-patients-dept');
  var snap = await fs.getDocs(fs.collection(db, 'patients'));
  var rows = [];
  snap.forEach(function(d) {
    var p = d.data();
    if (statusFilter && p.status !== statusFilter) return;
    if (deptFilter && (p.department || p.dept) !== deptFilter) return;
    rows.push({
      id: d.id, uhid: p.uhid || '', fname: p.fname || '', lname: p.lname || '',
      dob: dateInput(p.dob), gender: p.gender || '', contact: p.contact || '',
      email: p.email || '', address: p.address || '',
      bloodGroup: p.bloodGroup || p.blood || '',
      department: p.department || p.dept || '',
      admissionType: p.admissionType || p.type || '',
      status: p.status || '', assignedDoctor: p.assignedDoctor || '',
      lastVisit: dateInput(p.lastVisit),
      createdOn: dateInput(p.createdOn || p.createdAt),
      notes: (p.notes || '').replace(/\n/g, ' ')
    });
  });
  if (rows.length === 0) { toast('No patients match filters', 'warning'); return; }
  var headers = ['First Name','Last Name','Phone','Email','Gender','DOB','Address','Blood Group','Department','Admission Type','Status','Assigned Doctor','UHID','ID','Last Visit','Created On','Notes'];
  var keyMap = {'First Name':'fname','Last Name':'lname','Phone':'contact','Email':'email','Gender':'gender','DOB':'dob','Address':'address','Blood Group':'bloodGroup','Department':'department','Admission Type':'admissionType','Status':'status','Assigned Doctor':'assignedDoctor','UHID':'uhid','ID':'id','Last Visit':'lastVisit','Created On':'createdOn','Notes':'notes'};
  var data = rows.map(function(r) { return headers.map(function(h) { return r[keyMap[h]]; }); });
  downloadCSV('patients_export', headers, data);
  toast('Exported ' + rows.length + ' patients', 'success');
  document.getElementById('metaPatients').textContent = rows.length + ' records exported';
}

async function exportAppointments(db, fs) {
  var from = getFilterVal('filter-appointments-from');
  var to = getFilterVal('filter-appointments-to');
  var statusFilter = getFilterVal('filter-appointments-status');
  var snap = await fs.getDocs(fs.collection(db, 'appointments'));
  var rows = [];
  snap.forEach(function(d) {
    var a = d.data();
    if (statusFilter && a.status !== statusFilter) return;
    if (!inDateRange(a.date, 'filter-appointments-from', 'filter-appointments-to')) return;
    rows.push({
      id: d.id, patientName: a.patientName || a.patient || '',
      patientId: a.patientId || '', doctor: a.doctor || '',
      department: a.department || '', date: dateInput(a.date),
      time: a.time || '', type: a.type || '', status: a.status || '',
      notes: (a.notes || '').replace(/\n/g, ' '),
      createdOn: dateInput(a.createdOn || a.createdAt)
    });
  });
  if (rows.length === 0) { toast('No appointments match filters', 'warning'); return; }
  var headers = ['ID','Patient Name','Patient ID','Doctor','Department','Date','Time','Type','Status','Notes','Created On'];
  var data = rows.map(function(r) { return headers.map(function(h) { return r[Object.keys(r)[headers.indexOf(h)]]; }); });
  downloadCSV('appointments_export', headers, data);
  toast('Exported ' + rows.length + ' appointments', 'success');
  document.getElementById('metaAppointments').textContent = rows.length + ' records exported';
}

async function exportInventory(db, fs) {
  var catFilter = getFilterVal('filter-inventory-cat');
  var statusFilter = getFilterVal('filter-inventory-status');
  var snap = await fs.getDocs(fs.collection(db, 'inventory'));
  var rows = [];
  snap.forEach(function(d) {
    var i = d.data();
    if (catFilter && i.category !== catFilter) return;
    if (statusFilter) {
      var qty = i.quantity != null ? Number(i.quantity) : 0;
      var rl = i.reorderLevel != null ? Number(i.reorderLevel) : 0;
      var invStatus = qty <= 0 ? 'out-of-stock' : qty <= rl ? 'low-stock' : 'in-stock';
      if (invStatus !== statusFilter) return;
    }
    rows.push({
      id: d.id, name: i.name || i.medicineName || '', category: i.category || '',
      manufacturer: i.manufacturer || '', batchNo: i.batchNo || i.batch || '',
      quantity: i.quantity != null ? i.quantity : '', unit: i.unit || '',
      unitPrice: i.unitPrice != null ? i.unitPrice : '',
      expiryDate: dateInput(i.expiryDate || i.expiry),
      reorderLevel: i.reorderLevel != null ? i.reorderLevel : '',
      supplier: i.supplier || '', location: i.location || i.rack || '',
      status: i.status || '', notes: (i.notes || '').replace(/\n/g, ' ')
    });
  });
  if (rows.length === 0) { toast('No inventory matches filters', 'warning'); return; }
  var headers = ['ID','Medicine Name','Category','Manufacturer','Batch No','Quantity','Unit','Unit Price','Expiry Date','Reorder Level','Supplier','Location','Status','Notes'];
  var data = rows.map(function(r) { return headers.map(function(h) { return r[Object.keys(r)[headers.indexOf(h)]]; }); });
  downloadCSV('inventory_export', headers, data);
  toast('Exported ' + rows.length + ' inventory items', 'success');
  document.getElementById('metaInventory').textContent = rows.length + ' records exported';
}

async function exportLab(db, fs) {
  var from = getFilterVal('filter-lab-from');
  var to = getFilterVal('filter-lab-to');
  var statusFilter = getFilterVal('filter-lab-status');
  var snap = await fs.getDocs(fs.collection(db, 'lab_orders'));
  var rows = [];
  snap.forEach(function(d) {
    var l = d.data();
    if (statusFilter && l.status !== statusFilter) return;
    if (!inDateRange(l.orderedDate || l.date || l.createdOn, 'filter-lab-from', 'filter-lab-to')) return;
    rows.push({
      id: d.id, patientName: l.patientName || l.patient || '',
      patientId: l.patientId || '', doctor: l.doctor || '',
      testName: l.testName || l.test || '', category: l.category || '',
      orderedDate: dateInput(l.orderedDate || l.date || l.createdOn),
      resultDate: dateInput(l.resultDate), result: l.result || '',
      status: l.status || '', notes: (l.notes || '').replace(/\n/g, ' '),
      price: l.price != null ? l.price : ''
    });
  });
  if (rows.length === 0) { toast('No lab records match filters', 'warning'); return; }
  var headers = ['ID','Patient Name','Patient ID','Doctor','Test Name','Category','Ordered Date','Result Date','Result','Status','Notes','Price'];
  var data = rows.map(function(r) { return headers.map(function(h) { return r[Object.keys(r)[headers.indexOf(h)]]; }); });
  downloadCSV('lab_reports_export', headers, data);
  toast('Exported ' + rows.length + ' lab records', 'success');
  document.getElementById('metaLab').textContent = rows.length + ' records exported';
}

async function exportTransactions(db, fs) {
  var from = getFilterVal('filter-transactions-from');
  var to = getFilterVal('filter-transactions-to');
  var statusFilter = getFilterVal('filter-transactions-status');
  var snap = await fs.getDocs(fs.collection(db, 'transactions'));
  var rows = [];
  snap.forEach(function(d) {
    var t = d.data();
    if (statusFilter && t.status !== statusFilter) return;
    if (!inDateRange(t.date || t.createdOn || t.createdAt, 'filter-transactions-from', 'filter-transactions-to')) return;
    rows.push({
      id: d.id, patientName: t.patientName || t.patient || '',
      patientId: t.patientId || '', amount: t.amount != null ? t.amount : '',
      paymentMode: t.paymentMode || t.mode || '',
      paymentMethod: t.paymentMethod || '', status: t.status || '',
      transactionId: t.transactionId || t.txnId || '',
      description: (t.description || t.notes || '').replace(/\n/g, ' '),
      date: formatDateTime(t.date || t.createdOn || t.createdAt),
      recordedBy: t.recordedBy || ''
    });
  });
  if (rows.length === 0) { toast('No transactions match filters', 'warning'); return; }
  var headers = ['ID','Patient Name','Patient ID','Amount','Payment Mode','Payment Method','Status','Transaction ID','Description','Date','Recorded By'];
  var data = rows.map(function(r) { return headers.map(function(h) { return r[Object.keys(r)[headers.indexOf(h)]]; }); });
  downloadCSV('transactions_export', headers, data);
  toast('Exported ' + rows.length + ' transactions', 'success');
  document.getElementById('metaTransactions').textContent = rows.length + ' records exported';
}

async function exportDoctors(db, fs) {
  var snap = await fs.getDocs(fs.collection(db, 'doctors'));
  var rows = [];
  snap.forEach(function(d) {
    var doc = d.data();
    rows.push({
      id: d.id, name: doc.name || doc.fname + ' ' + (doc.lname || '') || '',
      specialization: doc.specialization || '', department: doc.department || '',
      contact: doc.contact || '', email: doc.email || '',
      qualification: doc.qualification || '',
      experience: doc.experience != null ? doc.experience : '',
      consultationFee: doc.consultationFee != null ? doc.consultationFee : '',
      status: doc.status || 'available', schedule: doc.schedule || ''
    });
  });
  if (rows.length === 0) { toast('No doctors found', 'warning'); return; }
  var headers = ['ID','Name','Specialization','Department','Contact','Email','Qualification','Experience (years)','Consultation Fee','Status','Schedule'];
  var data = rows.map(function(r) { return headers.map(function(h) { return r[Object.keys(r)[headers.indexOf(h)]]; }); });
  downloadCSV('doctors_export', headers, data);
  toast('Exported ' + rows.length + ' doctors', 'success');
  document.getElementById('metaDoctors').textContent = rows.length + ' records exported';
}

// ===== EXPORT ALL =====
var _exportQueue = [];
var _exportTotal = 0;
var _exportDone = 0;

function showProgress(pct, label) {
  var bar = document.getElementById('exportProgress');
  bar.classList.add('active');
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent = Math.round(pct) + '%';
  if (label) document.getElementById('progressLabel').textContent = label;
}

function hideProgress() {
  document.getElementById('exportProgress').classList.remove('active');
}

async function exportAll() {
  var btn = document.getElementById('exportAllBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons-round">sync</span> Exporting...';

  _exportQueue = ['patients', 'appointments', 'inventory', 'lab', 'transactions', 'doctors'];
  _exportTotal = _exportQueue.length;
  _exportDone = 0;

  showProgress(0, 'Starting export...');

  var db = window.firebaseDb;
  var fs = window.firebaseFS;

  for (var i = 0; i < _exportQueue.length; i++) {
    var type = _exportQueue[i];
    var pct = ((i) / _exportTotal) * 100;
    showProgress(pct, 'Exporting ' + type + '...');

    try {
      switch (type) {
        case 'patients': await exportPatients(db, fs); break;
        case 'appointments': await exportAppointments(db, fs); break;
        case 'inventory': await exportInventory(db, fs); break;
        case 'lab': await exportLab(db, fs); break;
        case 'transactions': await exportTransactions(db, fs); break;
        case 'doctors': await exportDoctors(db, fs); break;
      }
      _exportDone++;
    } catch (e) {
      console.error(type + ' export failed:', e);
    }

    showProgress(((_exportDone) / _exportTotal) * 100, _exportDone + ' of ' + _exportTotal + ' done');
  }

  showProgress(100, 'All exports complete!');
  toast('Export complete: ' + _exportDone + ' of ' + _exportTotal + ' collections exported', 'success');

  setTimeout(hideProgress, 3000);
  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons-round">file_download</span> Export All';
}
window.exportAll = exportAll;

// ===== LOAD RECORD COUNTS =====
async function loadExportCounts() {
  try {
    var db = window.firebaseDb;
    var fs = window.firebaseFS;
    var collections = ['patients', 'appointments', 'inventory', 'lab_orders', 'transactions', 'doctors'];
    var ids = ['statPatients', 'statAppointments', 'statInventory', 'statLab', 'statTransactions', 'statDoctors'];
    var metaIds = ['metaPatients', 'metaAppointments', 'metaInventory', 'metaLab', 'metaTransactions', 'metaDoctors'];
    var names = ['patients', 'appointments', 'inventory items', 'lab records', 'transactions', 'doctors'];

    for (var i = 0; i < collections.length; i++) {
      (function(idx) {
        fs.getDocs(fs.collection(db, collections[idx])).then(function(snap) {
          var count = snap.size;
          var el = document.getElementById(ids[idx]);
          if (el) el.textContent = count.toLocaleString();
          var mel = document.getElementById(metaIds[idx]);
          if (mel) mel.textContent = count + ' ' + names[idx] + ' available';
        }).catch(function() {});
      })(i);
    }
  } catch (e) {
    console.warn('Failed to load counts:', e);
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  if (window._authReady) await window._authReady;
  if (!window._currentFirebaseUser) {
    await new Promise(function(resolve) {
      var check = setInterval(function() {
        if (window._currentFirebaseUser) { clearInterval(check); resolve(); }
      }, 50);
      setTimeout(function() { clearInterval(check); resolve(); }, 5000);
    });
  }
  loadExportCounts();
});
