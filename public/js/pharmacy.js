'use strict';
HMS.requireAuth();

let MEDICINES = [];
let MEDICINES_MAP = {}; // name -> Firestore doc ID lookup

const REQUISITIONS = [];
const NOTIFICATIONS = [];

let _invLoaded = false, _patCursor = null, _patComplete = false;
const PAT_PAGE_SIZE = 100;

function saveInventory() {
  try { localStorage.setItem('hms_inventory', JSON.stringify(MEDICINES)); } catch(e) { /* quota errors */ }
}

function medicineName(m) {
  return String(m.name || m.medName || m.medicineName || m.itemName || m.product || '').trim();
}

function medicineCategory(m) {
  return String(m.cat || m.category || m.type || '').trim();
}

function medicineMatches(m, query) {
  const name = medicineName(m).toLowerCase();
  const category = medicineCategory(m).toLowerCase();
  return name.includes(query) || category.includes(query);
}

function populateBillingMedicineDatalist() {
  const datalist = document.getElementById('billingMedicineList');
  if (!datalist) return;
  datalist.innerHTML = MEDICINES
    .filter(m => medicineName(m))
    .map(m => `<option value="${esc(medicineName(m))}"></option>`)
    .join('');
}

function esc(val) {
  return typeof val === 'string' ? val.replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  }) : (val == null ? '' : String(val));
}

const INVOICES = [];
const PRESCRIPTIONS = [];
const PATIENTS_DB = [];

let medFilter = 'all';
let billFilter = 'all';

function renderMedTable(data = MEDICINES) {
  const tbody = document.getElementById('medTableBody');
  if (!tbody) return;
  const statusFilter = document.getElementById('medStatusFilter')?.value || 'all';
  const filtered = data.filter(m => {
    if (medFilter !== 'all' && m.cat !== medFilter) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    return true;
  });
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--on-surface-var)">No medicines match your filters.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(m => {
    const batchesHtml = (m.batches || []).map(b =>
      `<span style="display:inline-block;background:var(--surface-mid);padding:1px 8px;border-radius:4px;font-size:.72rem;margin:1px 2px" title="Batch ${esc(b.batchNo)}: ${b.stock} units, Exp ${b.expiry}">${esc(b.batchNo)} <span style="font-weight:700">${b.stock}</span></span>`
    ).join(' ');
    return `
    <tr>
      <td style="font-weight:600">${esc(m.name)}</td>
      <td><span class="badge-status stable" style="text-transform:capitalize;background:rgba(59,130,246,.1);color:#2563EB">${esc(m.cat)}</span></td>
      <td style="font-size:.78rem;max-width:180px">${batchesHtml || '<span style="color:var(--outline)">—</span>'}</td>
      <td><span style="font-weight:700;color:${m.stock===0?'var(--accent-red)':m.stock<=m.reorderPoint?'var(--accent-amber)':'var(--accent-green)'}">${m.stock}</span> units</td>
      <td style="font-size:.82rem">${esc(m.rack) || '<span style="color:var(--outline)">—</span>'}</td>
      <td><span class="badge-status ${m.status==='in-stock'?'stable':m.status==='low'?'pending':'critical'}">${m.status==='in-stock'?'In Stock':m.status==='low'?'Low Stock':'Out of Stock'}</span></td>
      <td>
        <button class="icon-btn" onclick="triggerRopCheck('${esc(m.name)}')" title="Trigger Automated ROP Check"><span class="material-icons-round">sensors</span></button>
        <button class="icon-btn" onclick="openMedEdit('${esc(m.name)}')" title="Edit Medicine"><span class="material-icons-round">edit</span></button>
      </td>
    </tr>`;}).join('');
}

function filterMedCategory(btn, cat) {
  const chips = document.querySelectorAll('#tab-inventory .chip');
  chips.forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  medFilter = cat;
  renderMedTable();
}

function filterMedTable() {
  const q = document.getElementById('medSearch')?.value.toLowerCase() || '';
  renderMedTable(MEDICINES.filter(m => {
    if (!q) return true;
    const batchMatch = (m.batches || []).some(b => (b.batchNo || '').toLowerCase().includes(q));
    return m.name.toLowerCase().includes(q) ||
           (m.cat || '').toLowerCase().includes(q) ||
           (m.rack || '').toLowerCase().includes(q) ||
           batchMatch;
  }));
}

let _medSearchTimer = null;
let _allInventory = null;
let _allInventoryLoading = false;

async function ensureAllInventory() {
  if (_allInventory !== null) return _allInventory;
  if (_allInventoryLoading) {
    await new Promise(r => { const c = setInterval(() => { if (_allInventory !== null) { clearInterval(c); r(); } }, 100); });
    return _allInventory;
  }
  _allInventoryLoading = true;
  const fs = window.firebaseDb && window.firebaseFS;
  if (!fs) { _allInventory = []; _allInventoryLoading = false; return []; }
  const items = [];
  let cursor = null;
  try {
    while (true) {
      let q;
      const base = fs.collection(window.firebaseDb, 'inventory');
      if (cursor) {
        q = fs.query(base, fs.orderBy('__name__'), fs.startAfter(cursor), fs.limit(1000));
      } else {
        q = fs.query(base, fs.orderBy('__name__'), fs.limit(1000));
      }
      const snap = await fs.getDocs(q);
      if (snap.empty) break;
      snap.forEach(d => {
        const data = d.data();
        const batches = data.batches && data.batches.length > 0 ? data.batches : [{ batchNo: data.batchNo || 'LEGACY', stock: data.stock || 0, expiry: data.expiry || 'N/A', mrp: data.price || data.mrp || 0 }];
        const totalStock = batches.reduce((s, b) => s + (b.stock || 0), 0);
        const earliestBatch = batches.reduce((earliest, b) => (!earliest || (b.expiry && b.expiry < earliest.expiry) ? b : earliest), null);
        items.push({
          id: d.id,
          name: data.name || data.brandName || '',
          cat: data.cat || data.category || '',
          stock: totalStock,
          price: data.price || data.mrp || 0,
          expiry: earliestBatch ? earliestBatch.expiry : (data.expiry || 'N/A'),
          rack: data.rack || '',
          batches: batches,
          safetyStock: data.safetyStock || 30,
          leadTime: data.leadTime || 3,
          adu: data.adu || 10,
          reorderPoint: data.reorderPoint || 0,
          reorderQty: data.reorderQty || 100,
          status: data.status || (totalStock === 0 ? 'out' : totalStock <= data.reorderPoint ? 'low' : 'in-stock')
        });
      });
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < 1000) break;
    }
  } catch (e) { /* if full load fails, return what we have */ }
  _allInventory = items;
  _allInventoryLoading = false;
  return items;
}

function filterMedTableRemote() {
  clearTimeout(_medSearchTimer);
  _medSearchTimer = setTimeout(async () => {
    const q = document.getElementById('medSearch')?.value.trim().toLowerCase() || '';
    if (!q) { renderMedTable(); return; }
    const all = await ensureAllInventory();
    console.log('ensureAllInventory returned', all.length, 'items');
    const paracetamolCheck = all.find(m => m.name.toLowerCase().includes('paracetamol'));
    console.log('paracetamol in _allInventory?', !!paracetamolCheck, paracetamolCheck?.name);
    const paracetamolInMed = MEDICINES.find(m => m.name.toLowerCase().includes('paracetamol'));
    console.log('paracetamol in MEDICINES?', !!paracetamolInMed, paracetamolInMed?.name);
    const matched = all.filter(m => {
      if (!q) return true;
      const batchMatch = (m.batches || []).some(b => (b.batchNo || '').toLowerCase().includes(q));
      return m.name.toLowerCase().includes(q) ||
             (m.cat || '').toLowerCase().includes(q) ||
             (m.rack || '').toLowerCase().includes(q) ||
             batchMatch;
    });
    console.log('matched from _allInventory:', matched.length);
    if (matched.length > 0) {
      renderMedTable(matched);
    } else {
      const medFallback = MEDICINES.filter(m => {
        if (!q) return true;
        const batchMatch = (m.batches || []).some(b => (b.batchNo || '').toLowerCase().includes(q));
        return m.name.toLowerCase().includes(q) ||
               (m.cat || '').toLowerCase().includes(q) ||
               (m.rack || '').toLowerCase().includes(q) ||
               batchMatch;
      });
      console.log('fallback matched from MEDICINES:', medFallback.length);
      renderMedTable(medFallback);
    }
  }, 300);
}

function showLowStock() {
  medFilter = 'all';
  const chips = document.querySelectorAll('#tab-inventory .chip');
  chips.forEach(c => c.classList.remove('active'));
  if (chips.length > 0) chips[0].classList.add('active');
  const statusSel = document.getElementById('medStatusFilter');
  if (statusSel) statusSel.value = 'all';
  const invBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.textContent.trim().toLowerCase().includes('inventory'));
  if (invBtn) invBtn.click();
  const lowItems = MEDICINES.filter(m => m.status === 'low' || m.status === 'out');
  renderMedTable(lowItems);
  toast(`Showing ${lowItems.length} low-stock or out-of-stock items`, 'info', 'inventory_2');
}

function renderPrescriptions() {
  const list = document.getElementById('prescriptionList');
  if (!list) return;
  if (PRESCRIPTIONS.length === 0) {
    list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--outline);font-size:0.85rem">No prescriptions yet.</p>';
    return;
  }
  list.innerHTML = PRESCRIPTIONS.map(p => `
    <div class="rx-card">
      <div class="rx-icon"><span class="material-icons-round">medication</span></div>
      <div class="rx-body">
        <strong>${esc(p.patient)}</strong>
        <p>${esc(p.drug)} × ${esc(p.qty)} tabs · Ordered by ${esc(p.doctor)}</p>
        <p style="font-size:.72rem;color:var(--outline);margin-top:3px">${esc(p.issued)}</p>
      </div>
      <button class="btn-primary btn-sm" onclick="toast('Dispensed: ${esc(p.drug)}','success','check_circle')">Dispense</button>
    </div>
  `).join('');
}

function renderBillTable() {
  const tbody = document.getElementById('billTableBody');
  if (!tbody) return;
  const filtered = billFilter === 'all' ? INVOICES : INVOICES.filter(i => i.status === billFilter);
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--on-surface-var)">No invoices yet.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(i => `
    <tr>
      <td><code style="background:var(--surface-mid);padding:2px 6px;border-radius:4px;font-size:.78rem">${esc(i.inv)}</code></td>
      <td style="font-weight:600">${esc(i.patient)}</td>
      <td style="font-size:.82rem">${esc(i.date)}</td>
      <td>${i.items} items</td>
      <td style="font-weight:700;font-family:var(--font-head)">₹${Number(i.amount).toLocaleString()}</td>
      <td><span class="badge-status ${i.status==='paid'?'stable':'pending'}">${i.status==='paid'?'Paid':'Unpaid'}</span></td>
      <td>
        <button class="icon-btn" onclick="viewBill('${esc(i.inv)}')"><span class="material-icons-round">visibility</span></button>
        <button class="icon-btn" onclick="printInvoice('${esc(i.inv)}')"><span class="material-icons-round">print</span></button>
        ${i.status==='unpaid'?`<button class="btn-primary btn-sm" onclick="markPaid('${esc(i.inv)}')">Mark Paid</button>`:''}
      </td>
    </tr>
  `).join('');
}

function filterBill(btn, f) {
  document.querySelectorAll('#tab-billing .chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  billFilter = f;
  renderBillTable();
}

async function markPaid(inv) {
  const i = INVOICES.find(x => x.inv === inv);
  if (i) { i.status = 'paid'; renderBillTable();
    try { const fs = window.firebaseDb && window.firebaseFS; if (fs && i._docId) await fs.updateDoc(fs.doc(window.firebaseDb, 'transactions', i._docId), { status: 'paid' }); } catch (e) { /* ignore */ }
    toast(`${inv} marked as paid!`, 'success'); }
}

function viewBill(inv) {
  const i = INVOICES.find(x => x.inv === inv);
  if (!i) return;
  const content = document.getElementById('viewBillContent');
  if (!content) return;
  content.innerHTML = `
    <div style="padding:28px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
        <div>
          <h2 style="font-family:var(--font-head);font-size:1.5rem;font-weight:800">Invoice ${esc(i.inv)}</h2>
          <p style="color:var(--on-surface-var);font-size:.85rem">${esc(i.date)} · ${esc(i.patient)}</p>
        </div>
        <span class="badge-status ${i.status==='paid'?'stable':'pending'}" style="font-size:.9rem;padding:6px 16px">${i.status==='paid'?'✓ PAID':'⏳ UNPAID'}</span>
      </div>
      <div style="border:1px solid var(--outline-var);border-radius:var(--radius-md);overflow:hidden;margin-bottom:16px">
        <div style="background:var(--surface-mid);padding:12px 16px;font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em">Wellness Medicals HMS · Tax Invoice</div>
        <div style="padding:16px">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--surface-mid)"><span>Consultation Fee</span><span style="font-weight:600">₹500.00</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--surface-mid)"><span>Medicines & Supplies</span><span style="font-weight:600">₹${(i.amount-500-180).toLocaleString()}.00</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--surface-mid)"><span>GST (18%)</span><span style="font-weight:600">₹180.00</span></div>
          <div style="display:flex;justify-content:space-between;padding:12px 0;font-family:var(--font-head);font-size:1.1rem;font-weight:800;color:var(--primary-light)"><span>Total Amount</span><span>₹${Number(i.amount).toLocaleString()}.00</span></div>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn-secondary" onclick="closeModal(null,'viewBillModal')">Close</button>
        <button class="btn-primary" onclick="printInvoice('${esc(i.inv)}')"><span class="material-icons-round">print</span> Print</button>
      </div>
    </div>
  `;
  openModal('viewBillModal');
}

async function submitAddMed(e) {
  e.preventDefault();
  const batchNo = document.getElementById('medBatchNo').value;
  const batchStock = parseInt(document.getElementById('medStock').value) || 0;
  const batchExpiry = document.getElementById('medExpiry').value || 'N/A';
  const batchMrp = parseFloat(document.getElementById('medPrice').value) || 0;
  const safetyStock = 30;
  const leadTime = 3;
  const adu = 10;
  const reorderPoint = (adu * leadTime) + safetyStock;
  const reorderQty = 100;

  const name = document.getElementById('medName').value;
  const batches = [{ batchNo, stock: batchStock, expiry: batchExpiry, mrp: batchMrp }];
  const m = {
    name: name,
    searchName: name.toLowerCase(),
    cat: document.getElementById('medCat').value.toLowerCase(),
    rack: document.getElementById('medRack').value.trim(),
    stock: batchStock,
    price: batchMrp,
    expiry: batchExpiry,
    batches: batches,
    safetyStock: safetyStock,
    leadTime: leadTime,
    adu: adu,
    reorderPoint: reorderPoint,
    reorderQty: reorderQty,
    status: batchStock === 0 ? 'out' : batchStock <= reorderPoint ? 'low' : 'in-stock'
  };

  // Persist to Firestore
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (fs) await fs.addDoc(fs.collection(window.firebaseDb, 'inventory'), m);
  } catch (e) { addConsoleLog('WARN', 'Failed to save med to Firestore: ' + e.message); }

  MEDICINES.unshift(m);
  saveInventory();
  renderMedTable();
  if (typeof renderRopConfigTable === 'function') { renderRopConfigTable(); populateSimMedSelect(); }
  populateBillingMedicineDatalist();
  closeModal(null,'addMedModal');
  toast(`${m.name} added to inventory!`, 'success');
}

/* --- Edit Medicine --- */
function openMedEdit(name) {
  const m = MEDICINES.find(x => x.name === name);
  if (!m) return;
  document.getElementById('editMedName').value = m.name;
  document.getElementById('editMedCat').value = m.cat.charAt(0).toUpperCase() + m.cat.slice(1);
  document.getElementById('editMedRack').value = m.rack || '';
  document.getElementById('editSafetyStock').value = m.safetyStock || 30;
  document.getElementById('editLeadTime').value = m.leadTime || 3;
  document.getElementById('editAdu').value = m.adu || 10;
  document.getElementById('editReorderQty').value = m.reorderQty || 100;
  renderEditBatches(m);
  openModal('editMedModal');
}

function renderEditBatches(m) {
  const container = document.getElementById('editBatchesList');
  if (!container) return;
  const count = document.getElementById('editBatchCount');
  if (count) count.textContent = `(${(m.batches || []).length} total)`;
  container.innerHTML = (m.batches || []).map((b, i) => `
    <div class="bill-item-row edit-batch-row" style="margin-bottom:6px;gap:6px">
      <input type="text" class="edit-batch-no" value="${esc(b.batchNo)}" placeholder="Batch No" style="width:100px;font-size:.78rem" />
      <input type="number" class="edit-batch-stock" value="${b.stock}" placeholder="Stock" min="0" style="width:65px;font-size:.78rem" />
      <input type="date" class="edit-batch-expiry" value="${b.expiry !== 'N/A' ? b.expiry : ''}" style="width:115px;font-size:.78rem" />
      <input type="number" class="edit-batch-mrp" value="${b.mrp || 0}" placeholder="MRP" min="0" step="0.01" style="width:80px;font-size:.78rem" />
      <button type="button" class="icon-btn danger" onclick="removeEditBatchRow(this)" title="Remove batch"><span class="material-icons-round" style="font-size:18px">delete</span></button>
    </div>
  `).join('');
}

function addEditBatchRow() {
  const container = document.getElementById('editBatchesList');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'bill-item-row edit-batch-row';
  row.style.cssText = 'margin-bottom:6px;gap:6px';
  row.innerHTML = '<input type="text" class="edit-batch-no" placeholder="Batch No" style="width:100px;font-size:.78rem" /><input type="number" class="edit-batch-stock" placeholder="Stock" min="0" style="width:65px;font-size:.78rem" /><input type="date" class="edit-batch-expiry" style="width:115px;font-size:.78rem" /><input type="number" class="edit-batch-mrp" placeholder="MRP" min="0" step="0.01" style="width:80px;font-size:.78rem" /><button type="button" class="icon-btn danger" onclick="removeEditBatchRow(this)" title="Remove batch"><span class="material-icons-round" style="font-size:18px">delete</span></button>';
  container.appendChild(row);
  const count = document.getElementById('editBatchCount');
  const total = container.querySelectorAll('.edit-batch-row').length;
  if (count) count.textContent = `(${total} total)`;
}

function removeEditBatchRow(btn) {
  const row = btn.closest('.edit-batch-row');
  if (!row) return;
  const container = document.getElementById('editBatchesList');
  if (container && container.querySelectorAll('.edit-batch-row').length <= 1) { toast('At least one batch is required.', 'error'); return; }
  row.remove();
  const count = document.getElementById('editBatchCount');
  if (count && container) count.textContent = `(${container.querySelectorAll('.edit-batch-row').length} total)`;
}

async function submitEditMed(e) {
  e.preventDefault();
  const name = document.getElementById('editMedName').value;
  const m = MEDICINES.find(x => x.name === name);
  if (!m) return;
  m.cat = document.getElementById('editMedCat').value.toLowerCase();
  m.rack = document.getElementById('editMedRack').value.trim();
  m.safetyStock = parseInt(document.getElementById('editSafetyStock').value) || 30;
  m.leadTime = parseInt(document.getElementById('editLeadTime').value) || 3;
  m.adu = parseInt(document.getElementById('editAdu').value) || 10;
  m.reorderQty = parseInt(document.getElementById('editReorderQty').value) || 100;
  m.reorderPoint = (m.adu * m.leadTime) + m.safetyStock;
  // Read batches from form
  const batchRows = document.querySelectorAll('#editBatchesList .edit-batch-row');
  m.batches = Array.from(batchRows).map(r => ({
    batchNo: r.querySelector('.edit-batch-no').value.trim(),
    stock: parseInt(r.querySelector('.edit-batch-stock').value) || 0,
    expiry: r.querySelector('.edit-batch-expiry').value || 'N/A',
    mrp: parseFloat(r.querySelector('.edit-batch-mrp').value) || 0
  })).filter(b => b.batchNo);
  m.stock = m.batches.reduce((s, b) => s + b.stock, 0);
  m.price = m.batches.length > 0 ? m.batches[0].mrp : 0;
  m.expiry = m.batches.reduce((earliest, b) => (!earliest || (b.expiry && b.expiry < earliest.expiry) ? b : earliest), null)?.expiry || 'N/A';
  m.status = m.stock === 0 ? 'out' : m.stock <= m.reorderPoint ? 'low' : 'in-stock';
  // Persist to Firestore
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (fs && m.id) await fs.updateDoc(fs.doc(window.firebaseDb, 'inventory', m.id), {
      cat: m.cat, rack: m.rack, stock: m.stock, price: m.price, expiry: m.expiry,
      batches: m.batches, safetyStock: m.safetyStock, leadTime: m.leadTime, adu: m.adu,
      reorderQty: m.reorderQty, reorderPoint: m.reorderPoint, status: m.status
    });
  } catch (e) { addConsoleLog('WARN', 'Failed to save medicine edit: ' + e.message); }
  renderMedTable();
  if (typeof renderRopConfigTable === 'function') { renderRopConfigTable(); populateSimMedSelect(); }
  closeModal(null, 'editMedModal');
  toast(`${m.name} updated!`, 'success');
}

function renderBillItemMatch(row, match) {
  const status = row.querySelector('.bill-item-status');
  if (!status) return;
  if (!match) { status.innerHTML = ''; return; }
  const statusColor = match.status === 'out' ? 'var(--accent-red)' : match.status === 'low' ? 'var(--accent-amber)' : 'var(--accent-green)';
  const statusLabel = match.status === 'out' ? 'Out of Stock' : match.status === 'low' ? 'Low Stock' : 'In Stock';
  const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
  const unitPrice = Number(match.price || 0);
  const lineAmount = qty * unitPrice;
  status.innerHTML = `<span class="bill-match-pill" style="color:${statusColor}">${esc(medicineName(match))} - ${statusLabel} (${match.stock} units) - Unit Rs ${unitPrice.toFixed(2)} - Amount Rs ${lineAmount.toFixed(2)}</span>`;
}

function updateBillTotal() {
  const consult = parseFloat(document.getElementById('billConsult')?.value)||0;
  let itemsTotal = 0;
  document.querySelectorAll('.bill-item-row').forEach(row => {
    const amount = parseFloat(row.querySelector('.item-price')?.value)||0;
    itemsTotal += amount;
  });
  const total = consult + itemsTotal;
  const el = document.getElementById('billTotalAmt');
  if (el) el.textContent = total.toFixed(2);
}

function updateBillLineAmount(qtyInput) {
  const row = qtyInput.closest('.bill-item-row');
  if (!row) return;
  const amountInput = row.querySelector('.item-price');
  const unitPrice = parseFloat(row.dataset.unitPrice);
  if (amountInput && Number.isFinite(unitPrice)) {
    const qty = parseFloat(qtyInput.value) || 0;
    amountInput.value = (qty * unitPrice).toFixed(2);
    amountInput.dataset.manual = 'false';
    const match = MEDICINES.find(m => medicineName(m).toLowerCase() === (row.dataset.selectedMedicine || '').toLowerCase());
    if (match) renderBillItemMatch(row, match);
  }
  updateBillTotal();
}

function addBillItem() {
  const container = document.getElementById('billItemsContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'bill-item-row';
  row.innerHTML = '<input type="text" placeholder="Item name" class="item-name" list="billingMedicineList" autocomplete="off" /><input type="number" placeholder="Qty" class="item-qty" min="1" value="1" oninput="updateBillLineAmount(this)" /><input type="number" placeholder="Amount" class="item-price" min="0" oninput="this.dataset.manual=\'true\';updateBillTotal()" /><button type="button" class="icon-btn danger" onclick="this.parentElement.remove();updateBillTotal()"><span class="material-icons-round">delete</span></button><div class="bill-item-status" aria-live="polite"></div>';
  container.appendChild(row);
}

async function submitBill(e) {
  e.preventDefault();
  const patient = document.getElementById('billPatient').value;
  const amount = parseFloat(document.getElementById('billTotalAmt').textContent) || 0;
  const fs = window.firebaseDb && window.firebaseFS;
  let docRef;
  try {
    if (fs) docRef = await fs.addDoc(fs.collection(window.firebaseDb, 'transactions'), {
      patientName: patient, amount, items: document.querySelectorAll('.bill-item-row').length + 1,
      status: 'unpaid', createdAt: fs.serverTimestamp?.() || new Date().toISOString()
    });
  } catch (e) { addConsoleLog('WARN', 'Failed to save invoice: ' + e.message); }
  const docId = docRef?.id;
  const newInv = { _docId: docId, inv: docId ? docId.slice(0, 8).toUpperCase() : `INV-${String(INVOICES.length+1).padStart(3,'0')}`, patient, date: new Date().toISOString().slice(0,10), items: document.querySelectorAll('.bill-item-row').length+1, amount, status:'unpaid' };
  INVOICES.unshift(newInv);
  closeModal(null,'generateBillModal');
  switchTab(document.querySelector('.tab-btn:last-child'), 'billing');
  renderBillTable();
  toast(`Invoice ${newInv.inv} generated for ${patient}!`, 'success');
}

function printInvoice(inv) {
  const i = INVOICES.find(x => x.inv === inv);
  if (!i) { toast('Invoice not found', 'error'); return; }
  toast(`Printing invoice ${inv}...`, 'info', 'print');
}

function initPatientAutocomplete() {
  const input = document.getElementById('billPatient');
  const dropdown = document.getElementById('billPatientDropdown');
  if (!input || !dropdown) return;

  function renderOptions(query = '') {
    const q = query.toLowerCase();
    const patientSource = (window.allPatients && window.allPatients.length > 0) ? window.allPatients : PATIENTS_DB; const filtered = patientSource.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q));
    if (filtered.length === 0) {
      dropdown.innerHTML = '<div class="autocomplete-item" style="color:var(--on-surface-var); cursor:default;">No patients found.</div>';
      return;
    }
    dropdown.innerHTML = filtered.map(p => `
      <div class="autocomplete-item" onclick="selectBillPatient('${esc(p.name)} - ${esc(p.phone)}')">
        <div class="ac-avatar">${esc(p.name.substring(0,2).toUpperCase())}</div>
        <div class="ac-info">
          <span class="ac-name">${esc(p.name)}</span>
          <span class="ac-phone">${esc(p.phone)}</span>
        </div>
      </div>
    `).join('');
  }

  input.addEventListener('focus', () => { renderOptions(input.value); dropdown.classList.add('active'); });
  input.addEventListener('input', () => { renderOptions(input.value); dropdown.classList.add('active'); });
  document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('billPatientAutocomplete');
    if (wrapper && !wrapper.contains(e.target)) dropdown.classList.remove('active');
  });

  window.selectBillPatient = function(val) { input.value = val; dropdown.classList.remove('active'); };
}

/* --- Firestore loaders --- */
const INV_PAGE_SIZE = 100;
let _invCursor = null;
let _invComplete = false;

function updateLoadMoreBtn() {
  const cont = document.getElementById('loadMoreInvContainer');
  if (!cont) return;
  cont.hidden = _invComplete || MEDICINES.length === 0;
}

async function loadInventoryFromFirestore(reset = true) {
  if (_invComplete) return;
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (!fs) return;
    if (reset) { MEDICINES = []; MEDICINES_MAP = {}; _invCursor = null; _invComplete = false; }
    let q = fs.query(fs.collection(window.firebaseDb, 'inventory'), fs.orderBy('__name__'), fs.limit(INV_PAGE_SIZE));
    if (_invCursor) q = fs.query(fs.collection(window.firebaseDb, 'inventory'), fs.orderBy('__name__'), fs.startAfter(_invCursor), fs.limit(INV_PAGE_SIZE));
    const snap = await fs.getDocs(q);
    if (snap.empty) {
      if (reset && MEDICINES.length === 0) {
        const raw = localStorage.getItem('hms_inventory');
        if (raw) { try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) MEDICINES = parsed; } catch(_) {} }
      }
      _invComplete = true;
      updateLoadMoreBtn();
      return;
    }
    snap.forEach(d => {
      const data = d.data();
      const batches = data.batches && data.batches.length > 0 ? data.batches : [{ batchNo: data.batchNo || 'LEGACY', stock: data.stock || 0, expiry: data.expiry || 'N/A', mrp: data.price || data.mrp || 0 }];
      const totalStock = batches.reduce((s, b) => s + (b.stock || 0), 0);
      const earliestBatch = batches.reduce((earliest, b) => (!earliest || (b.expiry && b.expiry < earliest.expiry) ? b : earliest), null);
      const item = {
        id: d.id,
        name: data.name || data.brandName || '',
        cat: data.cat || data.category || '',
        stock: totalStock,
        price: data.price || data.mrp || 0,
        expiry: earliestBatch ? earliestBatch.expiry : (data.expiry || 'N/A'),
        rack: data.rack || '',
        batches: batches,
        safetyStock: data.safetyStock || 30,
        leadTime: data.leadTime || 3,
        adu: data.adu || 10,
        reorderPoint: data.reorderPoint || 0,
        reorderQty: data.reorderQty || 100,
        status: data.status || (totalStock === 0 ? 'out' : totalStock <= data.reorderPoint ? 'low' : 'in-stock')
      };
      MEDICINES.push(item);
      MEDICINES_MAP[item.name.toLowerCase()] = d.id;
    });
    _invCursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < INV_PAGE_SIZE) _invComplete = true;
    try { localStorage.setItem('hms_inventory', JSON.stringify(MEDICINES)); } catch(_) {}
    _invLoaded = true;
    updateLoadMoreBtn();
  } catch (e) {
    addConsoleLog('WARN', 'Could not load inventory: ' + e.message);
    _invComplete = true;
    updateLoadMoreBtn();
    if (reset) {
      const raw = localStorage.getItem('hms_inventory');
      if (raw) { try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) MEDICINES = parsed; } catch(_) {} }
    }
  }
}

async function loadMoreInventory() {
  if (_invComplete || !_invCursor) { updateLoadMoreBtn(); return; }
  await loadInventoryFromFirestore(false);
  renderMedTable();
  if (typeof renderRopConfigTable === 'function') { renderRopConfigTable(); populateSimMedSelect(); }
  updateLoadMoreBtn();
}

async function loadPatientsForPharmacy(reset = true) {
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (!fs) return;
    if (window.allPatients && window.allPatients.length > 0) {
      PATIENTS_DB.length = 0;
      PATIENTS_DB.push(...window.allPatients);
      return;
    }
    if (reset) { PATIENTS_DB.length = 0; _patCursor = null; _patComplete = false; }
    if (_patComplete) return;
    let q = fs.query(fs.collection(window.firebaseDb, 'patients'), fs.orderBy('name'), fs.limit(PAT_PAGE_SIZE));
    if (_patCursor) q = fs.query(fs.collection(window.firebaseDb, 'patients'), fs.orderBy('name'), fs.startAfter(_patCursor), fs.limit(PAT_PAGE_SIZE));
    const snap = await fs.getDocs(q);
    if (!snap.empty) {
      snap.forEach(d => {
        const data = d.data();
        PATIENTS_DB.push({
          name: data.name || data.patientName || 'Unknown',
          phone: data.phone || data.contact || data.mobile || ''
        });
      });
      _patCursor = snap.docs[snap.docs.length - 1];
    }
    if (snap.empty || snap.docs.length < PAT_PAGE_SIZE) _patComplete = true;
  } catch (e) {
    addConsoleLog('WARN', 'Could not load patients: ' + e.message);
  }
}

async function loadMorePatients() {
  if (_patComplete) return;
  await loadPatientsForPharmacy(false);
  if (typeof initPatientAutocomplete === 'function') initPatientAutocomplete();
}

async function loadRequisitionsFromFirestore() {
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (!fs) return;
    const snap = await fs.getDocs(fs.query(fs.collection(window.firebaseDb, 'purchase_requisitions'), fs.orderBy('createdAt', 'desc'), fs.limit(50)));
    snap.forEach(d => {
      const data = d.data();
      REQUISITIONS.push({ id: d.id, name: data.name, qty: data.qty, date: data.date, status: data.status });
    });
  } catch (e) {
    addConsoleLog('WARN', 'Could not load requisitions: ' + e.message);
  }
}

async function loadNotificationsFromFirestore() {
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (!fs) return;
    const snap = await fs.getDocs(fs.query(fs.collection(window.firebaseDb, 'notifications'), fs.orderBy('createdAt', 'desc'), fs.limit(50)));
    snap.forEach(d => {
      const data = d.data();
      NOTIFICATIONS.push({ time: data.time, message: data.message, type: data.type });
    });
  } catch (e) {
    addConsoleLog('WARN', 'Could not load notifications: ' + e.message);
  }
}

async function loadPrescriptionsFromFirestore() {
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (!fs) return;
    const q = fs.query(fs.collection(window.firebaseDb, 'prescriptions'), fs.orderBy('createdAt', 'desc'), fs.limit(20));
    const snap = await fs.getDocs(q);
    snap.forEach(d => {
      const data = d.data();
      (data.medications || data.meds || []).forEach(med => {
        PRESCRIPTIONS.push({
          patient: data.patientName || data.patient || 'Unknown',
          drug: typeof med === 'string' ? med : med.name || med.med || '—',
          qty: typeof med === 'string' ? '—' : med.qty || med.dosage || '—',
          doctor: data.doctor || '—',
          issued: data.createdAt?.toDate?.()?.toLocaleDateString?.() || data.time || '—'
        });
      });
    });
  } catch (e) {
    addConsoleLog('WARN', 'Could not load prescriptions: ' + e.message);
  }
}

async function loadInvoicesFromFirestore() {
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (!fs) return;
    const q = fs.query(fs.collection(window.firebaseDb, 'transactions'), fs.orderBy('createdAt', 'desc'), fs.limit(20));
    const snap = await fs.getDocs(q);
    snap.forEach(d => {
      const data = d.data();
      INVOICES.push({
        _docId: d.id,
        inv: d.id.slice(0, 8).toUpperCase(),
        patient: data.patientName || data.patient || 'Unknown',
        date: data.createdAt?.toDate?.()?.toLocaleDateString?.() || new Date().toISOString().slice(0, 10),
        items: data.items || 0,
        amount: data.amount || 0,
        status: data.status || 'unpaid'
      });
    });
  } catch (e) {
    addConsoleLog('WARN', 'Could not load invoices: ' + e.message);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window._authReady) await window._authReady;
  if (!window._currentFirebaseUser) {
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (window._currentFirebaseUser) { clearInterval(check); resolve(); }
      }, 50);
      setTimeout(() => { clearInterval(check); resolve(); }, 5000);
    });
  }
  await Promise.all([
    loadInventoryFromFirestore(),
    loadPrescriptionsFromFirestore(),
    loadInvoicesFromFirestore(),
    loadPatientsForPharmacy(),
    loadRequisitionsFromFirestore(),
    loadNotificationsFromFirestore()
  ]);
  MEDICINES.forEach(m => {
    if (m.leadTime === undefined) m.leadTime = 3;
    if (m.adu === undefined) m.adu = Math.round((m.reorderPoint - m.safetyStock) / m.leadTime) || 10;
  });
  saveInventory();
  renderMedTable();
  renderPrescriptions();
  renderBillTable();
  initPatientAutocomplete();
  initBillItemAutocomplete();

  if (typeof renderRopConfigTable === 'function') { renderRopConfigTable(); renderPrTable(); renderRopNotifList(); populateSimMedSelect(); }

  const billDate = document.getElementById('billDate');
  if (billDate) billDate.value = new Date().toISOString().slice(0,10);
});

/* --- ROP & Procurement --- */
function renderRopConfigTable() {
  const tbody = document.getElementById('ropConfigTableBody');
  if (!tbody) return;
  tbody.innerHTML = MEDICINES.map(m => `
    <tr>
      <td style="font-weight:600">${esc(m.name)}</td>
      <td style="font-size:.82rem">${esc(m.rack) || '<span style="color:var(--outline)">—</span>'}</td>
      <td><span style="font-weight:700;color:${m.stock===0?'var(--accent-red)':m.stock<=m.reorderPoint?'var(--accent-amber)':'var(--accent-green)'}">${m.stock}</span> units</td>
      <td>${m.safetyStock} units</td>
      <td style="font-weight:600;color:var(--primary-light)">${m.reorderPoint} units</td>
      <td>${m.reorderQty} units</td>
      <td><button class="icon-btn" onclick="openRopConfig('${esc(m.name)}')" title="Configure ROP"><span class="material-icons-round">settings</span></button></td>
    </tr>
  `).join('');
}

function populateSimMedSelect() {
  const select = document.getElementById('simMedSelect');
  if (!select) return;
  select.innerHTML = MEDICINES.map(m => `<option value="${esc(m.name)}">${esc(m.name)} (Stock: ${m.stock})</option>`).join('');
}

function renderPrTable() {
  const tbody = document.getElementById('prTableBody');
  if (!tbody) return;
  if (REQUISITIONS.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--outline)">No active purchase requisitions</td></tr>';
    return;
  }
  tbody.innerHTML = REQUISITIONS.map(r => {
    let statusClass = 'pending';
    let statusLabel = 'Pending';
    let actionBtn = '';
    if (r.status === 'ordered') { statusClass = 'recovering'; statusLabel = 'Ordered'; actionBtn = `<button type="button" class="btn-primary btn-sm" onclick="receiveRopStock('${esc(r.id)}')"><span class="material-icons-round">download</span> Receive</button>`; }
    else if (r.status === 'received') { statusClass = 'stable'; statusLabel = 'Received'; }
    else { actionBtn = `<button type="button" class="btn-secondary btn-sm" onclick="approveRopPR('${esc(r.id)}')"><span class="material-icons-round">local_shipping</span> Order</button>`; }
    return `<tr><td style="font-weight:700;font-family:monospace">${esc(r.id)}</td><td>${esc(r.name)}</td><td><strong>${r.qty}</strong> units</td><td><span class="badge-status ${statusClass}">${statusLabel}</span></td><td>${actionBtn}</td></tr>`;
  }).join('');
}

function renderRopNotifList() {
  const list = document.getElementById('ropNotificationList');
  if (!list) return;
  if (NOTIFICATIONS.length === 0) {
    list.innerHTML = '<p style="padding:12px;font-size:.82rem;color:var(--on-surface-var);text-align:center">No alerts logged</p>';
    return;
  }
  list.innerHTML = NOTIFICATIONS.map(n => `
    <div class="rx-card" style="border-left: 4px solid ${n.type==='error'?'var(--accent-red)':n.type==='warning'?'var(--accent-amber)':n.type==='info'?'var(--accent-blue)':'var(--accent-green)'}; padding: 10px 14px; margin-bottom: 8px;">
      <div class="rx-icon" style="color:${n.type==='error'?'var(--accent-red)':n.type==='warning'?'var(--accent-amber)':n.type==='info'?'var(--accent-blue)':'var(--accent-green)'}; background:rgba(0,0,0,0.03); width:32px; height:32px;">
        <span class="material-icons-round" style="font-size:18px">${n.type==='error'?'error':n.type==='warning'?'sensors':n.type==='info'?'info':'check_circle'}</span>
      </div>
      <div class="rx-body" style="margin-left:-4px">
        <p style="font-size:0.8rem; line-height:1.4; color:var(--on-surface)">${esc(n.message)}</p>
        <span style="font-size:0.68rem; color:var(--outline); display:block; margin-top:2px;">${esc(n.time)}</span>
      </div>
    </div>
  `).join('');
}

function openRopConfig(medName) {
  const m = MEDICINES.find(x => x.name === medName);
  if (!m) return;
  const nameInput = document.getElementById('ropConfigMedName');
  const nameHidden = document.getElementById('ropConfigMedNameHidden');
  const ssInput = document.getElementById('ropConfigSafetyStock');
  const ltInput = document.getElementById('ropConfigLeadTime');
  const aduInput = document.getElementById('ropConfigAdu');
  const rqInput = document.getElementById('ropConfigReorderQty');
  if (nameInput) nameInput.value = m.name;
  if (nameHidden) nameHidden.value = m.name;
  if (ssInput) ssInput.value = m.safetyStock;
  if (ltInput) ltInput.value = m.leadTime || 3;
  if (aduInput) aduInput.value = m.adu || 10;
  if (rqInput) rqInput.value = m.reorderQty || 100;
  calculateRopValue();
  openModal('configRopModal');
}

function calculateRopValue() {
  const ss = parseInt(document.getElementById('ropConfigSafetyStock')?.value) || 0;
  const lt = parseInt(document.getElementById('ropConfigLeadTime')?.value) || 0;
  const adu = parseInt(document.getElementById('ropConfigAdu')?.value) || 0;
  const calculated = (adu * lt) + ss;
  const valEl = document.getElementById('ropConfigCalculatedVal');
  if (valEl) valEl.textContent = calculated;
}

async function submitRopConfig(e) {
  e.preventDefault();
  const name = document.getElementById('ropConfigMedNameHidden')?.value;
  const m = MEDICINES.find(x => x.name === name);
  if (!m) return;
  m.safetyStock = parseInt(document.getElementById('ropConfigSafetyStock')?.value) || 0;
  m.leadTime = parseInt(document.getElementById('ropConfigLeadTime')?.value) || 0;
  m.adu = parseInt(document.getElementById('ropConfigAdu')?.value) || 0;
  m.reorderQty = parseInt(document.getElementById('ropConfigReorderQty')?.value) || 100;
  m.reorderPoint = (m.adu * m.leadTime) + m.safetyStock;
  m.status = m.stock === 0 ? 'out' : m.stock <= m.reorderPoint ? 'low' : 'in-stock';
  // Persist to Firestore
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (fs && m.id) await fs.updateDoc(fs.doc(window.firebaseDb, 'inventory', m.id), {
      safetyStock: m.safetyStock, leadTime: m.leadTime, adu: m.adu,
      reorderQty: m.reorderQty, reorderPoint: m.reorderPoint, status: m.status
    });
  } catch (e) { addConsoleLog('WARN', 'Failed to save ROP config: ' + e.message); }
  renderMedTable();
  renderRopConfigTable();
  populateSimMedSelect();
  closeModal(null, 'configRopModal');
  toast(`ROP parameters updated for ${m.name}!`, 'success');
  checkAndTriggerRop(m);
}

async function checkAndTriggerRop(m) {
  if (m.stock <= m.reorderPoint) {
    const activePr = REQUISITIONS.find(r => r.name === m.name && (r.status === 'pending' || r.status === 'ordered'));
    if (!activePr) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const fs = window.firebaseDb && window.firebaseFS;
      const prData = { name: m.name, qty: m.reorderQty, date: now.toISOString().slice(0, 10), status: 'pending', createdAt: fs?.serverTimestamp?.() || now.toISOString() };
      const notifData = { time: timeStr, message: `Automated PR generated for ${m.name} (Stock: ${m.stock} units, ROP: ${m.reorderPoint} units).`, type: m.stock <= m.safetyStock ? 'error' : 'warning', createdAt: fs?.serverTimestamp?.() || now.toISOString() };
      let prRef, notifRef;
      try {
        if (fs) { prRef = await fs.addDoc(fs.collection(window.firebaseDb, 'purchase_requisitions'), prData); notifRef = await fs.addDoc(fs.collection(window.firebaseDb, 'notifications'), notifData); }
      } catch (e) { addConsoleLog('WARN', 'Failed to persist ROP trigger: ' + e.message); }
      REQUISITIONS.unshift({ id: prRef?.id || `PR-${Date.now()}`, ...prData });
      NOTIFICATIONS.unshift(notifData);
      renderPrTable();
      renderRopNotifList();
      toast(`Auto-PR generated for ${m.name}!`, 'warning', 'sensors');
    }
  }
}

async function runDispenseSimulation(e) {
  e.preventDefault();
  const medName = document.getElementById('simMedSelect')?.value;
  const qty = parseInt(document.getElementById('simDispenseQty')?.value) || 0;
  const m = MEDICINES.find(x => x.name === medName);
  if (!m) return;
  if (m.stock < qty) { toast(`Cannot dispense ${qty} units. Only ${m.stock} available.`, 'error'); return; }
  m.stock -= qty;
  // Decrement from first batch with enough stock
  if (m.batches && m.batches.length > 0) {
    let remaining = qty;
    for (const b of m.batches) {
      if (remaining <= 0) break;
      const take = Math.min(b.stock, remaining);
      b.stock -= take;
      remaining -= take;
    }
    m.batches = m.batches.filter(b => b.stock > 0);
    if (m.batches.length === 0) { m.batches = [{ batchNo: 'ADJUSTED', stock: 0, expiry: m.expiry || 'N/A', mrp: m.price || 0 }]; }
  }
  m.status = m.stock === 0 ? 'out' : m.stock <= m.reorderPoint ? 'low' : 'in-stock';
  // Persist stock change to Firestore
  try {
    const fs = window.firebaseDb && window.firebaseFS;
    if (fs && m.id) await fs.updateDoc(fs.doc(window.firebaseDb, 'inventory', m.id), { stock: m.stock, status: m.status, batches: m.batches });
  } catch (e) { addConsoleLog('WARN', 'Failed to sync stock: ' + e.message); }
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fs = window.firebaseDb && window.firebaseFS;
  const notifData = { time: timeStr, message: `Simulation: Dispensed ${qty} units of ${m.name}. Stock reduced to ${m.stock} units.`, type: 'info', createdAt: fs?.serverTimestamp?.() || now.toISOString() };
  try { if (fs) await fs.addDoc(fs.collection(window.firebaseDb, 'notifications'), notifData); } catch (_) {}
  NOTIFICATIONS.unshift(notifData);
  toast(`Dispensed ${qty} units of ${m.name}`, 'info');
  renderMedTable();
  renderRopConfigTable();
  populateSimMedSelect();
  renderRopNotifList();
  saveInventory();
  checkAndTriggerRop(m);
}

function triggerRopCheck(name) {
  const m = MEDICINES.find(x => x.name === name);
  if (!m) return;
  toast(`Re-Order Point check triggered for ${m.name}...`, 'info');
  if (m.stock <= m.reorderPoint) { checkAndTriggerRop(m); }
  else { toast(`${m.name} stock (${m.stock}) is above ROP (${m.reorderPoint}). No PR needed.`, 'success'); }
}

async function approveRopPR(prId) {
  const r = REQUISITIONS.find(x => x.id === prId);
  if (!r) return;
  r.status = 'ordered';
  renderPrTable();
  toast(`Requisition ${prId} approved.`, 'success');
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fs = window.firebaseDb && window.firebaseFS;
  try { if (fs) await fs.updateDoc(fs.doc(window.firebaseDb, 'purchase_requisitions', prId), { status: 'ordered' }); } catch (e) { addConsoleLog('WARN', 'Failed to update PR: ' + e.message); }
  const notifData = { time: timeStr, message: `Purchase Requisition ${prId} approved.`, type: 'info', createdAt: fs?.serverTimestamp?.() || now.toISOString() };
  try { if (fs) await fs.addDoc(fs.collection(window.firebaseDb, 'notifications'), notifData); } catch (_) {}
  NOTIFICATIONS.unshift(notifData);
  renderRopNotifList();
}

async function receiveRopStock(prId) {
  const r = REQUISITIONS.find(x => x.id === prId);
  if (!r) return;
  const m = MEDICINES.find(x => x.name === r.name);
  if (!m) return;
  m.stock += r.qty;
  // Add to first existing batch or create a new batch entry
  if (m.batches && m.batches.length > 0) {
    m.batches[0].stock += r.qty;
  } else {
    m.batches = [{ batchNo: 'PR-' + prId.slice(0, 6), stock: r.qty, expiry: 'N/A', mrp: m.price || 0 }];
  }
  m.status = m.stock === 0 ? 'out' : m.stock <= m.reorderPoint ? 'low' : 'in-stock';
  r.status = 'received';
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fs = window.firebaseDb && window.firebaseFS;
  // Persist to Firestore
  try {
    if (fs) {
      if (m.id) await fs.updateDoc(fs.doc(window.firebaseDb, 'inventory', m.id), { stock: m.stock, status: m.status, batches: m.batches });
      await fs.updateDoc(fs.doc(window.firebaseDb, 'purchase_requisitions', prId), { status: 'received' });
    }
  } catch (e) { addConsoleLog('WARN', 'Failed to sync stock/PR: ' + e.message); }
  const notifData = { time: timeStr, message: `Received ${r.qty} units of ${m.name}. Stock level restored to ${m.stock} units.`, type: 'success', createdAt: fs?.serverTimestamp?.() || now.toISOString() };
  try { if (fs) await fs.addDoc(fs.collection(window.firebaseDb, 'notifications'), notifData); } catch (_) {}
  NOTIFICATIONS.unshift(notifData);
  renderMedTable();
  renderRopConfigTable();
  populateSimMedSelect();
  renderPrTable();
  renderRopNotifList();
  saveInventory();
  toast(`Stock received! Added ${r.qty} units to ${m.name}.`, 'success');
}

async function clearRopNotifs() {
  NOTIFICATIONS.length = 0; renderRopNotifList();
  try { const fs = window.firebaseDb && window.firebaseFS; if (fs) { const snap = await fs.getDocs(fs.collection(window.firebaseDb, 'notifications')); const batch = []; snap.forEach(d => batch.push(fs.deleteDoc(d.ref))); await Promise.all(batch); } } catch (_) {}
  toast('Alert log cleared.', 'info');
}

function initBillItemAutocomplete() {
  const container = document.getElementById('billItemsContainer');
  if (!container) return;
  populateBillingMedicineDatalist();
  let activeAc = null;
  function closeAc() { if (activeAc) { activeAc.remove(); activeAc = null; } }
  document.addEventListener('click', (e) => { if (!e.target.classList.contains('item-name')) closeAc(); });

  function setBillItemMatch(row, match) { renderBillItemMatch(row, match); }

  function applyBillMedicine(input, match, forceName = false) {
    const row = input.closest('.bill-item-row');
    if (!row || !match) return;
    if (forceName) input.value = medicineName(match);
    row.dataset.selectedMedicine = medicineName(match);
    row.dataset.unitPrice = Number(match.price || 0).toFixed(2);
    setBillItemMatch(row, match);
    const amountInput = row.querySelector('.item-price');
    const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
    if (amountInput && match.status !== 'out') { amountInput.value = (qty * Number(match.price || 0)).toFixed(2); amountInput.dataset.manual = 'false'; setBillItemMatch(row, match); }
    updateBillTotal();
    if (match.status === 'out') toast(`${medicineName(match)} is out of stock!`, 'error');
  }

  container.addEventListener('input', (e) => {
    if (!e.target.classList.contains('item-name')) return;
    const input = e.target;
    closeAc();
    const val = input.value.trim().toLowerCase();
    const row = input.closest('.bill-item-row');
    if (!row) return;
    if (!val) { setBillItemMatch(row, null); return; }
    const matches = MEDICINES.filter(m => medicineName(m) && medicineMatches(m, val));
    if (!matches.length) { setBillItemMatch(row, null); return; }
    row.style.position = 'relative';
    const exactMatch = matches.find(m => medicineName(m).toLowerCase() === val);
    applyBillMedicine(input, exactMatch || matches[0], false);
    const dd = document.createElement('div');
    dd.className = 'autocomplete-dropdown glass-card';
    dd.style.cssText = 'position:absolute;top:100%;left:0;width:280px;z-index:9999;max-height:220px;overflow-y:auto;';
    matches.forEach(m => {
      const statusColor = m.status === 'out' ? 'var(--accent-red)' : m.status === 'low' ? 'var(--accent-amber)' : 'var(--accent-green)';
      const statusLabel = m.status === 'out' ? 'Out of Stock' : m.status === 'low' ? 'Low Stock' : 'In Stock';
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      if (m.status === 'out') item.style.opacity = '0.55';
      item.innerHTML = `<div style="font-weight:600;font-size:.88rem">${esc(medicineName(m))}</div><div style="display:flex;align-items:center;gap:8px;margin-top:2px"><span style="font-size:.72rem;font-weight:700;color:${statusColor}">${statusLabel} (${m.stock} units)</span><span style="font-size:.72rem;color:var(--outline)">₹${Number(m.price).toFixed(2)}</span></div>`;
      item.addEventListener('mousedown', (ev) => { ev.preventDefault(); applyBillMedicine(input, m, true); closeAc(); });
      dd.appendChild(item);
    });
    row.appendChild(dd);
    activeAc = dd;
  });
}
