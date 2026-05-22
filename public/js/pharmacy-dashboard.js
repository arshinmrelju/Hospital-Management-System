/* =========================================
   PHARMACY-DASHBOARD.JS
   Digital Apothecary Portal Logic
   ========================================= */

'use strict';

let RX_QUEUE = [];

let filteredRxQueue = null;

let DRUG_INVENTORY = [];

let activeRxId = null;

/* --- Render Rx Queue --- */
function renderRxQueue() {
  const list = document.getElementById('rxQueueList');
  if (!list) return;

  const data = filteredRxQueue || RX_QUEUE;

  if (data.length === 0) {
    list.innerHTML = '<p style="text-align:center;padding:20px;color:var(--outline);font-size:0.85rem">No prescriptions found for this time span.</p>';
    const count = document.getElementById('rxQueueCount');
    if (count) count.textContent = '0 Pending';
    const resultCount = document.getElementById('rxResultCount');
    if (resultCount) resultCount.textContent = '0 Pending';
    return;
  }

  list.innerHTML = data.map(rx => `
    <div class="rx-card ${activeRxId === rx.id ? 'active' : ''}" onclick="selectRx('${rx.id}')" id="rxCard-${rx.id}">
      <div class="rx-icon">
        <span class="material-icons-round">receipt_long</span>
      </div>
      <div class="rx-meta">
        <div class="rx-name">${rx.patient} <span style="font-weight:400;color:var(--on-surface-var);font-size:0.78rem;">· Age ${rx.age}</span></div>
        <div class="rx-detail">${rx.id} · ${rx.doctor} · ${rx.time}</div>
        <div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px;">
          ${rx.meds.map(m => `<span class="dispensed-tag"><span class="material-icons-round" style="font-size:12px">medication</span>${m}</span>`).join('')}
        </div>
      </div>
      <span class="rx-status ${rx.status}">${rx.status.charAt(0).toUpperCase() + rx.status.slice(1)}</span>
    </div>
  `).join('');

  const count = document.getElementById('rxQueueCount');
  const pending = data.filter(r => r.status === 'pending').length;
  if (count) count.textContent = `${pending} Pending`;

  const countEl = document.getElementById('rxResultCount');
  if (countEl) {
    countEl.textContent = `${pending} Pending (${data.length} total)`;
  }
}

/* --- Filter Rx Queue --- */
function filterRxQueue() {
  const startDate = document.getElementById('rxStartDate')?.value;
  const startTime = document.getElementById('rxStartTime')?.value || '00:00';
  const endDate = document.getElementById('rxEndDate')?.value;
  const endTime = document.getElementById('rxEndTime')?.value || '23:59';

  if (!startDate) {
    toast('Please select a start date to filter.', 'warning');
    return;
  }

  const startTimestamp = new Date(`${startDate}T${startTime}`).getTime();
  const endTimestamp = endDate 
    ? new Date(`${endDate}T${endTime}`).getTime()
    : new Date(`${startDate}T23:59:59`).getTime();

  filteredRxQueue = RX_QUEUE.filter(p => {
    if (!p.timestamp) return false;
    const pTime = new Date(p.timestamp).getTime();
    return pTime >= startTimestamp && pTime <= endTimestamp;
  });

  renderRxQueue();

  // Show result badge
  const badge = document.getElementById('rxResultBadge');
  if (badge) badge.classList.add('visible');

  toast(`Found ${filteredRxQueue.length} prescription(s)`, 'info');
}

function clearRxQueueFilter() {
  document.getElementById('rxStartDate').value = '';
  document.getElementById('rxStartTime').value = '';
  document.getElementById('rxEndDate').value = '';
  document.getElementById('rxEndTime').value = '';
  filteredRxQueue = null;
  renderRxQueue();

  // Hide result badge
  const badge = document.getElementById('rxResultBadge');
  if (badge) badge.classList.remove('visible');

  toast('Filter cleared', 'info');
}

/* --- Select Rx --- */
function selectRx(id) {
  activeRxId = id;
  const rx = RX_QUEUE.find(r => r.id === id);
  if (!rx) return;

  // Update header
  const nameEl = document.getElementById('activeRxPatientName');
  if (nameEl) nameEl.textContent = `${rx.patient} · ${rx.id}`;

  const body = document.getElementById('activeRxBody');
  if (body) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;padding:4px 0;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div style="background:var(--surface-low);border-radius:var(--radius-md);padding:12px;border:1px solid var(--outline-var);">
            <p style="font-size:0.75rem;color:var(--on-surface-var);margin-bottom:4px;">PATIENT</p>
            <p style="font-weight:700;">${rx.patient}</p>
            <p style="font-size:0.78rem;color:var(--on-surface-var);">Age ${rx.age}</p>
          </div>
          <div style="background:var(--surface-low);border-radius:var(--radius-md);padding:12px;border:1px solid var(--outline-var);">
            <p style="font-size:0.75rem;color:var(--on-surface-var);margin-bottom:4px;">PRESCRIBING DOCTOR</p>
            <p style="font-weight:700;">${rx.doctor}</p>
            <p style="font-size:0.78rem;color:var(--on-surface-var);">${rx.time}</p>
          </div>
        </div>
        <div>
          <p style="font-size:0.75rem;font-weight:600;color:var(--on-surface-var);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;">Prescribed Medications</p>
          ${rx.meds.map(m => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface-low);border-radius:var(--radius-md);margin-bottom:6px;border:1px solid var(--outline-var);">
              <div style="display:flex;align-items:center;gap:10px;">
                <span class="material-icons-round" style="color:var(--primary-light);font-size:20px">medication</span>
                <span style="font-weight:600;font-size:0.85rem;">${m}</span>
              </div>
              <span style="background:rgba(16,185,129,0.1);color:#059669;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;">In Stock</span>
            </div>
          `).join('')}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:4px;">
          <button class="btn-secondary" onclick="markDispensed('${rx.id}')">
            <span class="material-icons-round">check_circle</span> Mark Dispensed
          </button>
          <button class="btn-primary" style="background:var(--primary-light);" onclick="dispenseAndBill('${rx.id}')">
            <span class="material-icons-round">payments</span> Dispense & Bill
          </button>
        </div>
      </div>
    `;
  }

  // Re-render queue highlights
  document.querySelectorAll('.rx-card').forEach(card => {
    card.classList.toggle('active', card.id === `rxCard-${id}`);
  });
}

/* --- Mark as Dispensed --- */
function markDispensed(id) {
  const rx = RX_QUEUE.find(r => r.id === id);
  if (rx) {
    rx.status = 'dispensing';
    renderRxQueue();
    selectRx(id);
    toast(`${rx.patient}'s prescription marked as dispensing!`, 'success');
  }
}

function dispenseAndBill(id) {
  const rx = RX_QUEUE.find(r => r.id === id);
  if (rx) {
    rx.status = 'ready';
    // Auto-fill invoice
    const invPatient = document.getElementById('invoicePatient');
    if (invPatient) invPatient.value = rx.patient;
    renderRxQueue();
    updateInvoiceTotal();
    toast(`Invoice auto-populated for ${rx.patient}!`, 'info', 'request_quote');
    // Scroll to billing
    document.getElementById('billing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

let invPageSize = 50;
let invCurrentPage = 1;
let invCursors = [null]; // Array of DocumentSnapshots for pagination
let currentSearchTerm = "";

/* --- Fetch & Render Drug Inventory (Master Table) --- */
async function fetchAndRenderInventory(direction = 0) {
  const list = document.getElementById('inventoryDataTableList');
  const paginationControls = document.getElementById('inventoryPagination');
  if (!list) return;

  try {
    list.innerHTML = '<p style="padding: 20px; color: var(--on-surface-var);">Loading live inventory...</p>';
    if (paginationControls) paginationControls.style.display = 'none';

    // Dynamically import Firestore to avoid breaking non-module script
    const { getFirestore, collection, getDocs, query, limit, where, orderBy, startAfter } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    
    // Wait for firebaseApp to initialize
    let retries = 0;
    while (!window.firebaseApp && retries < 20) {
      await new Promise(r => setTimeout(r, 100));
      retries++;
    }

    if (!window.firebaseApp) {
      list.innerHTML = '<p style="padding: 20px; color: var(--error);">Firebase not initialized.</p>';
      return;
    }

    const db = getFirestore(window.firebaseApp);
    let qConstraints = [];
    
    // Search constraints
    if (currentSearchTerm) {
      const term = currentSearchTerm.toLowerCase();
      qConstraints.push(where('searchName', '>=', term));
      qConstraints.push(where('searchName', '<=', term + '\uf8ff'));
      qConstraints.push(orderBy('searchName'));
    } else {
      qConstraints.push(orderBy('brandName'));
    }
    
    qConstraints.push(limit(invPageSize));

    // Pagination logic
    if (direction === 1) {
      invCurrentPage++;
    } else if (direction === -1) {
      invCurrentPage--;
    } else {
      invCurrentPage = 1;
      invCursors = [null]; // Reset cursors on new search
    }

    const cursor = invCursors[invCurrentPage - 1];
    if (cursor) {
      qConstraints.push(startAfter(cursor));
    }

    const q = query(collection(db, 'inventory'), ...qConstraints);
    const snapshot = await getDocs(q);
    
    DRUG_INVENTORY = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      DRUG_INVENTORY.push({
        itemNo: data.itemNo || '-',
        name: data.brandName || 'Unknown',
        content: data.content || '-',
        batch: data.batch || '-',
        mrp: data.mrp || 0,
        cost: data.cost || 0,
        stock: data.stock || 0,
        unit: data.unit || 'units',
        expiry: data.expiry || '-',
        purchaseDate: data.purchaseDate || '-',
        distributor: data.distributor || '-'
      });
    });

    if (DRUG_INVENTORY.length === 0) {
      list.innerHTML = '<p style="padding: 20px; color: var(--on-surface-var);">No matching inventory found.</p>';
      return;
    }

    // Save cursor for NEXT page
    const lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (invCursors.length <= invCurrentPage) {
      invCursors.push(lastDoc);
    } else {
      invCursors[invCurrentPage] = lastDoc;
    }

    renderInventoryUI();
    
    // Update pagination UI
    if (paginationControls) {
      paginationControls.style.display = 'flex';
      document.getElementById('inventoryPageInfo').textContent = `Showing page ${invCurrentPage}`;
      document.getElementById('invPrevBtn').disabled = (invCurrentPage === 1);
      document.getElementById('invNextBtn').disabled = (snapshot.docs.length < invPageSize);
    }

    // Re-render the initial invoice line with new options based on current view
    document.getElementById('invoiceLines').innerHTML = '';
    addInvoiceLine();
  } catch (error) {
    console.error("Error fetching inventory:", error);
    list.innerHTML = `<p style="padding: 20px; color: var(--error);">Failed to load inventory: ${error.message}</p>`;
  }
}

function renderInventoryUI() {
  const list = document.getElementById('inventoryDataTableList');
  if (!list) return;

  const tableHeader = `
    <table class="data-table">
      <thead>
        <tr>
          <th style="width:44px; text-align:center;">#</th>
          <th>Brand Name</th>
          <th>Content</th>
          <th>Batch</th>
          <th>Purchase Date</th>
          <th>MRP (₹)</th>
          <th>Distributor</th>
          <th>Expiry</th>
          <th>Stock</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  const pageOffset = (invCurrentPage - 1) * invPageSize;
  const tableRows = DRUG_INVENTORY.map((drug, index) => {
    let stockClass = '';
    if (drug.stock <= 5) stockClass = 'qty-critical';
    else if (drug.stock <= 20) stockClass = 'qty-low';
    else stockClass = 'qty-ok';

    return `
      <tr>
        <td style="text-align:center; color:var(--on-surface-var); font-size:0.78rem; font-weight:600;">${pageOffset + index + 1}</td>
        <td style="font-weight:600; color:var(--primary);">${drug.name}</td>
        <td>${drug.content}</td>
        <td>${drug.batch}</td>
        <td>${drug.purchaseDate}</td>
        <td>${drug.mrp}</td>
        <td>${drug.distributor}</td>
        <td>${drug.expiry}</td>
        <td class="${stockClass}">${drug.stock} <span style="font-size:0.7rem;color:var(--on-surface-var)">${drug.unit}</span></td>
      </tr>
    `;
  }).join('');

  const tableFooter = `</tbody></table>`;
  
  list.innerHTML = tableHeader + tableRows + tableFooter;
}

/* --- Fetch & Render Low Stock Levels (Progress Bars) --- */
async function fetchAndRenderStockLevels() {
  const list = document.getElementById('stockLevelsList');
  if (!list) return;

  try {
    list.innerHTML = '<p style="padding: 20px; color: var(--on-surface-var);">Loading stock levels...</p>';
    
    // We already have db from fetchAndRenderInventory, but just in case:
    if (!window.firebaseApp) return;
    const { getFirestore, collection, getDocs, query, limit, orderBy } = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
    const db = getFirestore(window.firebaseApp);
    
    // Fetch items with lowest stock first
    const q = query(collection(db, 'inventory'), orderBy('stock', 'asc'), limit(15));
    const snapshot = await getDocs(q);
    
    let lowStockItems = [];
    snapshot.forEach(doc => {
      lowStockItems.push(doc.data());
    });

    if (lowStockItems.length === 0) {
      list.innerHTML = '<p style="padding: 20px; color: var(--on-surface-var);">All stock levels are optimal.</p>';
      return;
    }

    list.innerHTML = lowStockItems.map(drug => {
      // Fake max stock calculation for the UI progress bar since CSV doesn't have it
      const maxStock = Math.max(drug.stock * 2, 50);
      const pct = Math.round((drug.stock / maxStock) * 100);
      const statusClass = pct > 40 ? 'ok' : pct > 15 ? 'low' : 'critical';
      return `
        <div class="stock-item">
          <span class="stock-label">${drug.brandName} <span style="font-size:0.7rem; color:var(--on-surface-var)">₹${drug.mrp}</span></span>
          <div class="stock-bar-wrap">
            <div class="stock-bar ${statusClass}" style="width:${pct}%;"></div>
          </div>
          <span class="stock-qty ${statusClass === 'ok' ? '' : statusClass}">${drug.stock} ${drug.unit}</span>
          ${statusClass !== 'ok' ? `<span class="material-icons-round" style="font-size:18px;color:${statusClass === 'critical' ? '#ef4444' : '#d97706'};margin-left:6px;">${statusClass === 'critical' ? 'error' : 'warning'}</span>` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error("Error fetching stock levels:", error);
    list.innerHTML = '<p style="padding: 20px; color: var(--error);">Failed to load stock levels.</p>';
  }
}

/* --- Invoice Builder --- */
function addInvoiceLine() {
  const container = document.getElementById('invoiceLines');
  if (!container) return;

  const line = document.createElement('div');
  line.className = 'invoice-line';
  line.innerHTML = `
    <select class="inv-drug-select" style="background:var(--surface);border:1.5px solid var(--outline-var);padding:7px 10px;border-radius:var(--radius-sm);font-size:0.82rem;color:var(--on-surface);" onchange="this.parentElement.querySelector('.inv-price').value = this.options[this.selectedIndex].dataset.price || 0; updateInvoiceTotal();">
      ${DRUG_INVENTORY.map(d => `<option value="${d.name}" data-price="${d.mrp}">${d.name}</option>`).join('')}
    </select>
    <input type="number" class="inv-qty" placeholder="Qty" min="1" value="1" style="background:var(--surface);border:1.5px solid var(--outline-var);padding:7px 10px;border-radius:var(--radius-sm);font-size:0.82rem;color:var(--on-surface);" oninput="updateInvoiceTotal()" />
    <input type="number" class="inv-price" placeholder="₹ Price" value="45" style="background:var(--surface);border:1.5px solid var(--outline-var);padding:7px 10px;border-radius:var(--radius-sm);font-size:0.82rem;color:var(--on-surface);" oninput="updateInvoiceTotal()" />
    <button onclick="removeInvoiceLine(this)" style="background:rgba(239,68,68,0.1);border:none;color:#ef4444;cursor:pointer;border-radius:var(--radius-sm);padding:6px;display:flex;align-items:center;">
      <span class="material-icons-round" style="font-size:18px;">close</span>
    </button>
  `;
  container.appendChild(line);
  updateInvoiceTotal();
}

function removeInvoiceLine(btn) {
  btn.closest('.invoice-line').remove();
  updateInvoiceTotal();
}

function updateInvoiceTotal() {
  const lines = document.querySelectorAll('.invoice-line');
  let total = 0;
  lines.forEach(line => {
    const qty = parseFloat(line.querySelector('.inv-qty')?.value) || 0;
    const price = parseFloat(line.querySelector('.inv-price')?.value) || 0;
    total += qty * price;
  });
  const el = document.getElementById('invoiceTotal');
  if (el) el.textContent = `₹${total.toFixed(2)}`;
}

function printInvoice() {
  const patient = document.getElementById('invoicePatient')?.value || 'Patient';
  toast(`Printing bill for ${patient}...`, 'info', 'print');
  setTimeout(() => toast('Invoice sent to Printer Queue!', 'success'), 1200);
}

function submitInvoice() {
  const patient = document.getElementById('invoicePatient')?.value || 'Patient';
  const total = document.getElementById('invoiceTotal')?.textContent || '₹0';
  toast(`Payment of ${total} collected from ${patient}!`, 'success', 'payments');
  // Reset form
  setTimeout(() => {
    document.getElementById('invoicePatient').value = '';
    document.getElementById('invoiceLines').innerHTML = '';
    addInvoiceLine();
    updateInvoiceTotal();
  }, 500);
}

/* --- Add Manual Rx --- */
function addManualRx() {
  const patient = document.getElementById('manualRxPatient')?.value.trim();
  const doctor = document.getElementById('manualRxDoctor')?.value.trim();
  const meds = document.getElementById('manualRxMeds')?.value.trim();
  if (!patient || !meds) {
    toast('Please fill in patient name and medications.', 'warning');
    return;
  }
  const newRx = {
    id: `RX-${2400 + RX_QUEUE.length + 1}`,
    patient,
    age: 0,
    doctor: doctor || 'Unknown',
    meds: meds.split('\n').filter(Boolean),
    status: 'pending',
    time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date().toISOString(),
    priority: 'medium'
  };
  RX_QUEUE.unshift(newRx);
  renderRxQueue();
  closeModal(null, 'newRxModal');
  document.getElementById('manualRxPatient').value = '';
  document.getElementById('manualRxDoctor').value = '';
  document.getElementById('manualRxMeds').value = '';
  toast(`Manual Rx added for ${patient}!`, 'success', 'receipt_long');
}



/* --- Input listeners for invoice total --- */
document.addEventListener('DOMContentLoaded', () => {
  const todayChip = document.querySelector(`#rxSmartFilter .sf-chip[onclick*="'today'"]`);
  if (todayChip) {
    sfChipSelect(todayChip, 'rx', 'today');
  } else {
    renderRxQueue();
  }
  fetchAndRenderInventory();
  fetchAndRenderStockLevels();
  // Don't update invoice total here, it will be updated after inventory is fetched
  // Live Rx updates will come from Firestore

  // Event delegation for invoice inputs
  document.getElementById('invoiceLines')?.addEventListener('input', updateInvoiceTotal);

  // Setup search and pagination listeners
  const searchInput = document.getElementById('inventorySearch');
  if (searchInput) {
    // Simple debounce
    let timeout = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        currentSearchTerm = e.target.value.trim();
        fetchAndRenderInventory(0);
      }, 400);
    });
  }

  document.getElementById('invPrevBtn')?.addEventListener('click', () => fetchAndRenderInventory(-1));
  document.getElementById('invNextBtn')?.addEventListener('click', () => fetchAndRenderInventory(1));
});
