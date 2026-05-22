'use strict';
HMS.requireAuth();

let MEDICINES = [];
try {
  const raw = localStorage.getItem('hms_inventory');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) {
      MEDICINES = parsed;
    }
  }
} catch(e) { /* ignore parse errors */ }

const REQUISITIONS = [];
const NOTIFICATIONS = [];

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
  const filtered = data.filter(m => medFilter === 'all' || m.cat === medFilter);
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--on-surface-var)">No medicines in inventory. Add one to get started.</td></tr>';
    return;
  }
  tbody.innerHTML = filtered.map(m => `
    <tr>
      <td style="font-weight:600">${esc(m.name)}</td>
      <td><span class="badge-status stable" style="text-transform:capitalize;background:rgba(59,130,246,.1);color:#2563EB">${esc(m.cat)}</span></td>
      <td><span style="font-weight:700;color:${m.stock===0?'var(--accent-red)':m.stock<=m.reorderPoint?'var(--accent-amber)':'var(--accent-green)'}">${m.stock}</span> units</td>
      <td>₹${Number(m.price).toFixed(2)}</td>
      <td style="font-size:.82rem">${esc(m.expiry)}</td>
      <td><span class="badge-status ${m.status==='in-stock'?'stable':m.status==='low'?'pending':'critical'}">${m.status==='in-stock'?'In Stock':m.status==='low'?'Low Stock':'Out of Stock'}</span></td>
      <td>
        <button class="icon-btn" onclick="triggerRopCheck('${esc(m.name)}')" title="Trigger Automated ROP Check"><span class="material-icons-round">sensors</span></button>
        <button class="icon-btn" onclick="toast('Editing ${esc(m.name)}...','info','edit')"><span class="material-icons-round">edit</span></button>
      </td>
    </tr>
  `).join('');
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
  renderMedTable(MEDICINES.filter(m => m.name.toLowerCase().includes(q)));
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

function markPaid(inv) {
  const i = INVOICES.find(x => x.inv === inv);
  if (i) { i.status = 'paid'; renderBillTable(); toast(`${inv} marked as paid!`, 'success'); }
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

function submitAddMed(e) {
  e.preventDefault();
  const stock = parseInt(document.getElementById('medStock').value) || 0;
  const safetyStock = 30;
  const leadTime = 3;
  const adu = 10;
  const reorderPoint = (adu * leadTime) + safetyStock;
  const reorderQty = 100;

  const m = {
    name: document.getElementById('medName').value,
    cat: document.getElementById('medCat').value.toLowerCase(),
    stock: stock,
    price: parseFloat(document.getElementById('medPrice').value)||0,
    expiry: document.getElementById('medExpiry').value || 'N/A',
    safetyStock: safetyStock,
    leadTime: leadTime,
    adu: adu,
    reorderPoint: reorderPoint,
    reorderQty: reorderQty,
    status: stock === 0 ? 'out' : stock <= reorderPoint ? 'low' : 'in-stock'
  };
  MEDICINES.unshift(m);
  saveInventory();
  renderMedTable();
  if (typeof renderRopConfigTable === 'function') { renderRopConfigTable(); populateSimMedSelect(); }
  populateBillingMedicineDatalist();
  closeModal(null,'addMedModal');
  toast(`${m.name} added to inventory!`, 'success');
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

function submitBill(e) {
  e.preventDefault();
  const patient = document.getElementById('billPatient').value;
  const newInv = { inv: `INV-${String(INVOICES.length+1).padStart(3,'0')}`, patient, date: new Date().toISOString().slice(0,10), items: document.querySelectorAll('.bill-item-row').length+1, amount: parseFloat(document.getElementById('billTotalAmt').textContent)||0, status:'unpaid' };
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
    const filtered = PATIENTS_DB.filter(p => p.name.toLowerCase().includes(q) || p.phone.includes(q));
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

document.addEventListener('DOMContentLoaded', () => {
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

function submitRopConfig(e) {
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
  renderMedTable();
  renderRopConfigTable();
  populateSimMedSelect();
  closeModal(null, 'configRopModal');
  toast(`ROP parameters updated for ${m.name}!`, 'success');
  checkAndTriggerRop(m);
}

function checkAndTriggerRop(m) {
  if (m.stock <= m.reorderPoint) {
    const activePr = REQUISITIONS.find(r => r.name === m.name && (r.status === 'pending' || r.status === 'ordered'));
    if (!activePr) {
      const prId = `PR-2026-${String(REQUISITIONS.length + 1).padStart(3, '0')}`;
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      REQUISITIONS.unshift({ id: prId, name: m.name, qty: m.reorderQty, date: now.toISOString().slice(0, 10), status: 'pending' });
      NOTIFICATIONS.unshift({ time: timeStr, message: `Automated PR generated: ${prId} created for ${m.name} (Stock: ${m.stock} units, ROP: ${m.reorderPoint} units).`, type: m.stock <= m.safetyStock ? 'error' : 'warning' });
      renderPrTable();
      renderRopNotifList();
      toast(`Auto-PR ${prId} generated for ${m.name}!`, 'warning', 'sensors');
    }
  }
}

function runDispenseSimulation(e) {
  e.preventDefault();
  const medName = document.getElementById('simMedSelect')?.value;
  const qty = parseInt(document.getElementById('simDispenseQty')?.value) || 0;
  const m = MEDICINES.find(x => x.name === medName);
  if (!m) return;
  if (m.stock < qty) { toast(`Cannot dispense ${qty} units. Only ${m.stock} available.`, 'error'); return; }
  m.stock -= qty;
  m.status = m.stock === 0 ? 'out' : m.stock <= m.reorderPoint ? 'low' : 'in-stock';
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  NOTIFICATIONS.unshift({ time: timeStr, message: `Simulation: Dispensed ${qty} units of ${m.name}. Stock reduced to ${m.stock} units.`, type: 'info' });
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

function approveRopPR(prId) {
  const r = REQUISITIONS.find(x => x.id === prId);
  if (!r) return;
  r.status = 'ordered';
  renderPrTable();
  toast(`Requisition ${prId} approved and ordered from supplier.`, 'success');
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  NOTIFICATIONS.unshift({ time: timeStr, message: `Purchase Requisition ${prId} approved. Order transmitted to supplier.`, type: 'info' });
  renderRopNotifList();
}

function receiveRopStock(prId) {
  const r = REQUISITIONS.find(x => x.id === prId);
  if (!r) return;
  const m = MEDICINES.find(x => x.name === r.name);
  if (!m) return;
  m.stock += r.qty;
  m.status = m.stock === 0 ? 'out' : m.stock <= m.reorderPoint ? 'low' : 'in-stock';
  r.status = 'received';
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  NOTIFICATIONS.unshift({ time: timeStr, message: `Received ${r.qty} units of ${m.name} from Order ${prId}. Stock level restored to ${m.stock} units.`, type: 'success' });
  renderMedTable();
  renderRopConfigTable();
  populateSimMedSelect();
  renderPrTable();
  renderRopNotifList();
  saveInventory();
  toast(`Stock received! Added ${r.qty} units to ${m.name}.`, 'success');
}

function clearRopNotifs() { NOTIFICATIONS.length = 0; renderRopNotifList(); toast('Alert log cleared.', 'info'); }

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
