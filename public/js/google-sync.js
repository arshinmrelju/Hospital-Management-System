'use strict';

HMS.requireAuth();

// ===== STATE =====
let allPatients = [];
let syncLogs = [];
let syncConfig = { enabled: true, autoSyncNew: true, delegatedAdminEmail: '' };

// ===== HELPERS =====
function esc(val) {
  return typeof val === 'string' ? val.replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  }) : (val == null ? '' : String(val));
}

function formatTime(ts) {
  if (!ts) return '--';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function syncStatusBadge(status) {
  const map = {
    synced: '<span class="badge-status confirmed">Synced</span>',
    pending: '<span class="badge-status pending">Pending</span>',
    failed: '<span class="badge-status critical">Failed</span>',
    disabled: '<span class="badge-status completed">Off</span>',
    skipped: '<span class="badge-status completed">Skipped</span>'
  };
  return map[status] || `<span class="badge-status">${esc(status)}</span>`;
}

function logStatusBadge(status) {
  return status === 'success'
    ? '<span class="badge-status confirmed">Success</span>'
    : '<span class="badge-status critical">Failed</span>';
}

function logActionBadge(action) {
  const map = {
    create: '<span class="badge-status confirmed" style="background:rgba(16,185,129,0.12);color:#059669">Create</span>',
    update: '<span class="badge-status" style="background:rgba(59,130,246,0.12);color:#2563EB">Update</span>',
    skip: '<span class="badge-status completed">Skip</span>',
    error: '<span class="badge-status critical">Error</span>',
    delete: '<span class="badge-status critical">Delete</span>'
  };
  return map[action] || `<span class="badge-status">${esc(action)}</span>`;
}

// ===== CALL CLOUD FUNCTIONS =====
async function callFunction(name, payload) {
  try {
    const fn = window.firebaseFunctions;
    if (fn) {
      const result = await fn.httpsCallable(name)(payload);
      return result.data;
    }
  } catch (e) {
    console.warn(`Function ${name} not available locally:`, e);
    throw e;
  }
}

// ===== LOAD SYNC CONFIG =====
async function loadSyncConfig() {
  try {
    const snap = await window.firebaseFS.getDoc(
      window.firebaseFS.doc(window.firebaseDb, 'sync_config', 'settings')
    );
    if (snap.exists) {
      syncConfig = { enabled: true, autoSyncNew: true, delegatedAdminEmail: '', ...snap.data() };
    }
  } catch (e) {
    console.warn('Failed to load sync config:', e);
  }
  document.getElementById('syncEnabled').checked = syncConfig.enabled !== false;
  document.getElementById('autoSyncNew').checked = syncConfig.autoSyncNew !== false;
  document.getElementById('delegatedEmail').value = syncConfig.delegatedAdminEmail || '';
}

async function saveSyncConfig() {
  syncConfig.enabled = document.getElementById('syncEnabled').checked;
  syncConfig.autoSyncNew = document.getElementById('autoSyncNew').checked;
  syncConfig.delegatedAdminEmail = document.getElementById('delegatedEmail').value.trim();
  try {
    await window.firebaseFS.setDoc(
      window.firebaseFS.doc(window.firebaseDb, 'sync_config', 'settings'),
      syncConfig,
      { merge: true }
    );
    toast('Sync settings saved', 'success');
  } catch (e) {
    toast('Failed to save: ' + e.message, 'error');
  }
}
window.saveSyncConfig = saveSyncConfig;

async function toggleSyncConfig() {
  await saveSyncConfig();
}
window.toggleSyncConfig = toggleSyncConfig;

// ===== LOAD STATS =====
async function loadSyncStats() {
  try {
    const all = allPatients.filter(p => p.syncToGoogle === true);
    const synced = all.filter(p => p.syncStatus === 'synced').length;
    const pending = all.filter(p => p.syncStatus === 'pending' || !p.syncStatus).length;
    const failed = all.filter(p => p.syncStatus === 'failed').length;

    document.getElementById('statSynced').textContent = synced;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statFailed').textContent = failed;

    // Find last sync attempt
    const attempts = all
      .filter(p => p.syncLastAttempt)
      .sort((a, b) => {
        const ta = a.syncLastAttempt?.toDate ? a.syncLastAttempt.toDate() : new Date(0);
        const tb = b.syncLastAttempt?.toDate ? b.syncLastAttempt.toDate() : new Date(0);
        return tb - ta;
      });
    const lastEl = document.getElementById('statLastSync');
    if (attempts.length > 0) {
      lastEl.textContent = formatTime(attempts[0].syncLastAttempt);
      lastEl.style.fontSize = '1.2rem';
    } else {
      lastEl.textContent = 'Never';
    }
  } catch (e) {
    console.error('Stats error:', e);
  }
}

// ===== LOAD SYNC LOGS =====
async function loadSyncLogs() {
  const tbody = document.getElementById('syncLogsBody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--on-surface-var)"><span class="material-icons-round" style="font-size:20px;vertical-align:middle">hourglass_empty</span> Loading...</td></tr>';
  try {
    const snap = await window.firebaseFS.getDocs(
      window.firebaseFS.query(
        window.firebaseFS.collection(window.firebaseDb, 'sync_logs'),
        window.firebaseFS.orderBy('timestamp', 'desc'),
        window.firebaseFS.limit(50)
      )
    );
    syncLogs = [];
    snap.forEach(d => syncLogs.push({ id: d.id, ...d.data() }));
    renderSyncLogs();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--on-surface-var)">Failed to load logs.</td></tr>';
  }
}
window.loadSyncLogs = loadSyncLogs;

function renderSyncLogs() {
  const tbody = document.getElementById('syncLogsBody');
  if (syncLogs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--on-surface-var)">No sync activity yet.</td></tr>';
    return;
  }
  tbody.innerHTML = syncLogs.map(log => `
    <tr>
      <td style="white-space:nowrap;font-size:.75rem">${formatTime(log.timestamp)}</td>
      <td><strong>${esc(log.patientName || log.patientId)}</strong></td>
      <td>${logActionBadge(log.action)}</td>
      <td>${logStatusBadge(log.status)}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;font-size:.78rem">${esc(log.message)}</td>
    </tr>
  `).join('');
}

// ===== LOAD PATIENTS SYNC STATUS =====
async function loadSyncPatients() {
  try {
    const snap = await window.firebaseFS.getDocs(
      window.firebaseFS.query(
        window.firebaseFS.collection(window.firebaseDb, 'patients'),
        window.firebaseFS.orderBy('syncStatus', 'asc')
      )
    );
    allPatients = [];
    snap.forEach(d => allPatients.push({ id: d.id, ...d.data() }));
    renderSyncPatients();
    loadSyncStats();
  } catch (e) {
    document.getElementById('syncPatientsBody').innerHTML =
      '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--on-surface-var)">Failed to load patients.</td></tr>';
  }
}

function renderSyncPatients() {
  const filter = document.getElementById('syncFilterStatus')?.value || 'all';
  const search = (document.getElementById('syncPatientSearch')?.value || '').toLowerCase();
  const tbody = document.getElementById('syncPatientsBody');
  const countEl = document.getElementById('syncPatientCount');

  let filtered = allPatients;
  if (filter !== 'all') {
    filtered = filtered.filter(p => p.syncStatus === filter);
  }
  if (search) {
    filtered = filtered.filter(p =>
      (p.fname || '').toLowerCase().includes(search) ||
      (p.lname || '').toLowerCase().includes(search) ||
      (p.contact || '').includes(search)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--on-surface-var)">No patients match.</td></tr>';
    countEl.textContent = '0 patients';
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const name = `${esc(p.fname || '')} ${esc(p.lname || '')}`;
    const phone = esc(p.contact || '--');
    const syncIcon = p.syncToGoogle ? '<span class="material-icons-round" style="font-size:14px;color:#0D9488;vertical-align:middle">sync</span>' : '';
    return `<tr>
      <td><strong style="font-size:.82rem">${name}</strong> ${syncIcon}</td>
      <td style="font-size:.8rem">${phone}</td>
      <td>${syncStatusBadge(p.syncStatus)}</td>
      <td style="font-size:.7rem;font-family:monospace;max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(p.googleContactId || '--')}</td>
      <td style="font-size:.72rem;white-space:nowrap">${p.syncLastAttempt ? formatTime(p.syncLastAttempt) : '--'}</td>
      <td>
        <button class="icon-btn" title="Sync Now" onclick="manualSync('${esc(p.id)}')" ${p.syncToGoogle ? '' : 'disabled'}>
          <span class="material-icons-round">sync</span>
        </button>
        <button class="icon-btn" title="${p.syncLastError ? esc(p.syncLastError) : 'No error'}" ${p.syncStatus === 'failed' ? '' : 'disabled'}>
          <span class="material-icons-round">error_outline</span>
        </button>
      </td>
    </tr>`;
  }).join('');

  countEl.textContent = `${filtered.length} patient${filtered.length !== 1 ? 's' : ''}`;
}
window.renderSyncPatients = renderSyncPatients;

// ===== MANUAL SYNC =====
async function manualSync(patientId) {
  try {
    await callFunction('manualSyncPatient', { patientId });
    toast('Sync triggered for patient', 'success');
    await loadSyncPatients();
    await loadSyncLogs();
  } catch (e) {
    toast('Sync failed: ' + (e.message || 'Unknown error'), 'error');
  }
}
window.manualSync = manualSync;

// ===== BULK SYNC =====
async function startBulkSync() {
  const btn = document.getElementById('bulkSyncBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons-round">sync</span> Syncing...';
  try {
    const result = await callFunction('bulkSyncPatients', {});
    toast(result.message || 'Bulk sync complete', 'success');
    await loadSyncPatients();
    await loadSyncLogs();
  } catch (e) {
    toast('Bulk sync failed: ' + (e.message || 'Unknown error'), 'error');
  }
  btn.disabled = false;
  btn.innerHTML = '<span class="material-icons-round">sync</span> Bulk Sync All';
}
window.startBulkSync = startBulkSync;

// ===== RETRY FAILED =====
async function retryFailedSyncs() {
  toast('Retrying failed syncs...', 'info');
  try {
    const result = await callFunction('bulkSyncPatients', {});
    toast('Retry complete: ' + (result.message || ''), 'success');
    await loadSyncPatients();
    await loadSyncLogs();
  } catch (e) {
    toast('Retry failed: ' + (e.message || 'Unknown error'), 'error');
  }
}
window.retryFailedSyncs = retryFailedSyncs;

// ===== INIT =====
async function loadSyncDashboard() {
  await loadSyncConfig();
  await Promise.all([
    loadSyncPatients(),
    loadSyncLogs()
  ]);
}
window.loadSyncDashboard = loadSyncDashboard;

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
  loadSyncDashboard();
});
