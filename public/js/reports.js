'use strict';

const user = HMS.requireAuth();
if (user && !['Admin', 'Staff'].includes(user.role)) {
  toast('Unauthorized access to financial reports.', 'error');
  setTimeout(() => { window.location.href = 'dashboard.html'; }, 1000);
}

function esc(val) {
  return typeof val === 'string' ? val.replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  }) : (val == null ? '' : String(val));
}

let transactionList = JSON.parse(localStorage.getItem('hms_upi_transactions')) || [];

function saveTransactions() {
  localStorage.setItem('hms_upi_transactions', JSON.stringify(transactionList));
}

function addConsoleLog(type, msg) {
  const consoleEl = document.getElementById('apiConsoleLog');
  if (!consoleEl) return;
  const timeStr = new Date().toLocaleTimeString('en-IN', { hour12: false });
  const entry = document.createElement('div');
  entry.className = `log-entry ${type === 'WARN' ? 'log-warn' : ''}`;
  entry.innerHTML = `<span class="log-time">[${esc(timeStr)}]</span><span class="log-tag"><strong>[${esc(type)}]</strong></span><span class="log-msg">${esc(msg)}</span>`;
  consoleEl.appendChild(entry);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function renderTxnTable(data = transactionList) {
  const tbody = document.getElementById('txnTableBody');
  if (!tbody) return;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--on-surface-var)">No records found.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(txn => {
    const isSuccess = txn.status === 'SUCCESS';
    const isPending = txn.status === 'PENDING';
    let statusClass = 'cancelled';
    if (isSuccess) statusClass = 'confirmed';
    if (isPending) statusClass = 'pending';
    const localTime = new Date(txn.time).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
    return `<tr>
      <td><span class="txn-id-badge">${esc(txn.id)}</span></td>
      <td><div style="font-weight:600">${esc(txn.patientName)}</div><div style="font-size:0.72rem;color:var(--on-surface-var)">${esc(txn.patientId)}</div></td>
      <td><div class="vpa-text">${esc(txn.vpa)}</div></td>
      <td><strong>₹${Number(txn.amount).toLocaleString('en-IN')}</strong></td>
      <td><span style="font-size:0.8rem;color:var(--on-surface-var)">${esc(localTime)}</span></td>
      <td><span style="font-size:0.78rem;font-weight:500">${esc(txn.app)}</span></td>
      <td><span class="badge-status ${statusClass}">${esc(txn.status)}</span></td>
    </tr>`;
  }).join('');
}

function updateKPIs() {
  const totalUpiEl = document.getElementById('kpiTotalUpi');
  const rateEl = document.getElementById('kpiSuccessRate');
  const pendingEl = document.getElementById('kpiPendingSettlements');
  let totalCollections = 0, successCount = 0, totalCount = 0, pendingCount = 0;
  transactionList.forEach(txn => {
    totalCount++;
    if (txn.status === 'SUCCESS') { successCount++; totalCollections += txn.amount; }
    else if (txn.status === 'PENDING') { pendingCount += txn.amount; }
  });
  const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : 100;
  if (totalUpiEl) totalUpiEl.textContent = `₹${totalCollections.toLocaleString('en-IN')}`;
  if (rateEl) rateEl.textContent = `${successRate}%`;
  if (pendingEl) pendingEl.textContent = `₹${pendingCount.toLocaleString('en-IN')}`;
}

let lineTrendChartInstance = null;
let appShareChartInstance = null;

function updateCharts() {
  const trendCtx = document.getElementById('upiTrendChart')?.getContext('2d');
  const shareCtx = document.getElementById('upiShareChart')?.getContext('2d');
  if (!trendCtx || !shareCtx) return;
  const pastDays = {};
  for (let i = 4; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    pastDays[d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })] = 0;
  }
  transactionList.forEach(txn => {
    if (txn.status === 'SUCCESS') {
      const dateStr = new Date(txn.time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      if (pastDays[dateStr] !== undefined) pastDays[dateStr] += txn.amount;
    }
  });
  const trendLabels = Object.keys(pastDays);
  const trendData = Object.values(pastDays);
  const appCounts = { 'PhonePe': 0, 'Google Pay': 0, 'Paytm': 0, 'BHIM UPI': 0 };
  transactionList.forEach(txn => {
    if (txn.status === 'SUCCESS') {
      if (appCounts[txn.app] !== undefined) appCounts[txn.app] += txn.amount;
      else appCounts['BHIM UPI'] += txn.amount;
    }
  });
  const shareLabels = Object.keys(appCounts);
  const shareData = Object.values(appCounts);
  if (lineTrendChartInstance) lineTrendChartInstance.destroy();
  if (appShareChartInstance) appShareChartInstance.destroy();
  if (window.Chart) {
    lineTrendChartInstance = new Chart(trendCtx, {
      type: 'line',
      data: { labels: trendLabels, datasets: [{ label: 'UPI Revenue (₹)', data: trendData, borderColor: '#0D9488', backgroundColor: 'rgba(13, 148, 136, 0.1)', tension: 0.35, fill: true, borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#0D9488' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { family: 'Inter' } } }, x: { grid: { display: false }, ticks: { font: { family: 'Inter' } } } } }
    });
    appShareChartInstance = new Chart(shareCtx, {
      type: 'doughnut',
      data: { labels: shareLabels, datasets: [{ data: shareData, backgroundColor: ['#5F259F', '#34A853', '#00BAF2', '#E21A22'], borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { family: 'Inter', size: 11 } } } }, cutout: '68%' }
    });
  }
}

function filterTxnTable() {
  const query = (document.getElementById('searchTxn')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('statusFilter')?.value;
  const appFilter = document.getElementById('appFilter')?.value;
  const filtered = transactionList.filter(txn => {
    const matchesQuery = txn.patientName.toLowerCase().includes(query) || txn.id.toLowerCase().includes(query) || txn.vpa.toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'ALL' || txn.status === statusFilter;
    const matchesApp = appFilter === 'ALL' || txn.app === appFilter;
    return matchesQuery && matchesStatus && matchesApp;
  });
  renderTxnTable(filtered);
}

function exportTxnToCSV() {
  const headers = ['Transaction ID', 'Patient Name', 'Patient ID', 'UPI VPA', 'Amount (INR)', 'Timestamp', 'UPI Gateway App', 'Reconciliation Status'];
  const rows = transactionList.map(txn => [txn.id, txn.patientName, txn.patientId, txn.vpa, txn.amount, txn.time, txn.app, txn.status]);
  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `UPI_Reports_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Transaction ledger exported to CSV.', 'success');
}

document.addEventListener('DOMContentLoaded', () => {
  renderTxnTable();
  updateKPIs();
  updateCharts();
  addConsoleLog('INFO', 'Reports module initialized. UPI configuration must be done server-side in production.');
});
