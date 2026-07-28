/* =========================================================
   OFFLINE-SYNC.JS — HMS Offline Sync Orchestrator
   =========================================================
   Handles:
   1. Online/offline detection + premium status bar UI
   2. Saving data to IndexedDB after successful API calls
   3. When offline: intercepts write operations → queues them
   4. On reconnect: replays queue → server → confirms to staff
   ========================================================= */

'use strict';

(function () {

  /* ─────────────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────────────── */
  var _isOnline       = navigator.onLine;
  var _syncInProgress = false;
  var _pendingCount   = 0;
  var _syncBarEl      = null;
  var _syncStatusEl   = null;
  var _syncBadgeEl    = null;
  var _syncDotEl      = null;

  /* ─────────────────────────────────────────────────────
     OFFLINE STATUS BAR — Create and inject into DOM
  ───────────────────────────────────────────────────── */
  function createOfflineBar() {
    if (document.getElementById('hmsOfflineBar')) return;

    var bar = document.createElement('div');
    bar.id = 'hmsOfflineBar';
    bar.innerHTML =
      '<div class="hms-offline-inner">' +
        '<div class="hms-offline-left">' +
          '<div class="hms-offline-dot" id="hmsOfflineDot"></div>' +
          '<span class="material-icons-round hms-offline-icon" id="hmsOfflineIcon">wifi_off</span>' +
          '<span class="hms-offline-msg" id="hmsOfflineMsg">You\'re offline — showing cached data</span>' +
        '</div>' +
        '<div class="hms-offline-right">' +
          '<span class="hms-offline-badge" id="hmsOfflineBadge" style="display:none"></span>' +
          '<button class="hms-offline-retry" id="hmsOfflineRetry" onclick="window.OfflineSync.trySyncNow()">' +
            '<span class="material-icons-round">sync</span> Sync now' +
          '</button>' +
        '</div>' +
      '</div>';

    var style = document.createElement('style');
    style.textContent = [
      '#hmsOfflineBar {',
      '  position: fixed; top: 10px; left: 50%;',
      '  transform: translateX(-50%) translateY(-80px);',
      '  z-index: 99999;',
      '  background: rgba(146, 64, 14, 0.94);',
      '  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);',
      '  border: 1px solid rgba(251, 191, 36, 0.4);',
      '  color: #fef3c7; font-family: var(--font-body, "Inter", sans-serif);',
      '  font-size: 0.8rem; font-weight: 600;',
      '  border-radius: 999px;',
      '  box-shadow: 0 10px 30px rgba(180, 83, 9, 0.35), 0 2px 8px rgba(0,0,0,0.18);',
      '  transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1);',
      '  will-change: transform; pointer-events: auto;',
      '}',
      '#hmsOfflineBar.visible { transform: translateX(-50%) translateY(0); }',
      '#hmsOfflineBar.syncing {',
      '  background: rgba(6, 95, 70, 0.94);',
      '  border-color: rgba(110, 231, 183, 0.4);',
      '  color: #d1fae5;',
      '  box-shadow: 0 10px 30px rgba(5, 150, 105, 0.35), 0 2px 8px rgba(0,0,0,0.18);',
      '}',
      '#hmsOfflineBar.synced {',
      '  background: rgba(6, 95, 70, 0.94);',
      '  border-color: rgba(52, 211, 153, 0.5);',
      '  color: #d1fae5;',
      '}',
      '.hms-offline-inner {',
      '  display: flex; align-items: center; justify-content: space-between;',
      '  padding: 6px 16px; gap: 12px;',
      '}',
      '.hms-offline-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }',
      '.hms-offline-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }',
      '.hms-offline-dot {',
      '  width: 8px; height: 8px; border-radius: 50%;',
      '  background: #fcd34d; flex-shrink: 0;',
      '  box-shadow: 0 0 0 0 rgba(252,211,77,0.5);',
      '  animation: hmsOfflinePulse 2s infinite;',
      '}',
      '#hmsOfflineBar.syncing .hms-offline-dot,',
      '#hmsOfflineBar.synced .hms-offline-dot {',
      '  background: #6ee7b7;',
      '  box-shadow: 0 0 0 0 rgba(110,231,183,0.5);',
      '  animation: hmsOfflinePulse 1.5s infinite;',
      '}',
      '@keyframes hmsOfflinePulse {',
      '  0%   { box-shadow: 0 0 0 0 rgba(252,211,77,0.6); }',
      '  70%  { box-shadow: 0 0 0 6px rgba(252,211,77,0); }',
      '  100% { box-shadow: 0 0 0 0 rgba(252,211,77,0); }',
      '}',
      '.hms-offline-icon { font-size: 15px !important; opacity: 0.9; }',
      '.hms-offline-msg { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      '.hms-offline-badge {',
      '  background: rgba(255,255,255,0.22); border-radius: 20px;',
      '  padding: 1px 8px; font-size: 0.7rem; font-weight: 800;',
      '  white-space: nowrap;',
      '}',
      '.hms-offline-retry {',
      '  background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.35);',
      '  color: inherit; border-radius: 20px; padding: 3px 10px;',
      '  font-size: 0.7rem; font-weight: 700; cursor: pointer;',
      '  display: inline-flex; align-items: center; gap: 4px;',
      '  transition: background 0.2s;',
      '  font-family: var(--font-body, "Inter", sans-serif);',
      '}',
      '.hms-offline-retry:hover { background: rgba(255,255,255,0.28); }',
      '.hms-offline-retry .material-icons-round { font-size: 12px !important; }',
      '@keyframes hmsSpin { to { transform: rotate(360deg); } }',
      '.hms-offline-retry.spinning .material-icons-round { animation: hmsSpin 1s linear infinite; }'
    ].join('\n');

    document.head.appendChild(style);
    document.body.insertBefore(bar, document.body.firstChild);

    _syncBarEl    = bar;
    _syncStatusEl = document.getElementById('hmsOfflineMsg');
    _syncBadgeEl  = document.getElementById('hmsOfflineBadge');
    _syncDotEl    = document.getElementById('hmsOfflineDot');
  }

  function showBar(state, msg) {
    if (!_syncBarEl) createOfflineBar();
    _syncStatusEl = document.getElementById('hmsOfflineMsg');
    _syncBadgeEl  = document.getElementById('hmsOfflineBadge');

    _syncBarEl.className = state ? 'visible ' + state : 'visible';

    if (msg && _syncStatusEl) _syncStatusEl.textContent = msg;

    // Hide retry button while syncing
    var retryBtn = document.getElementById('hmsOfflineRetry');
    if (retryBtn) retryBtn.style.display = (state === 'syncing') ? 'none' : '';
  }

  function hideBar() {
    if (_syncBarEl) {
      _syncBarEl.className = '';
    }
  }

  function updateBadge(count) {
    _pendingCount = count;
    if (!_syncBadgeEl) _syncBadgeEl = document.getElementById('hmsOfflineBadge');
    if (!_syncBadgeEl) return;
    if (count > 0) {
      _syncBadgeEl.textContent = count + ' change' + (count !== 1 ? 's' : '') + ' pending';
      _syncBadgeEl.style.display = '';
    } else {
      _syncBadgeEl.style.display = 'none';
    }
  }

  /* ─────────────────────────────────────────────────────
     REFRESH PENDING COUNT from queue
  ───────────────────────────────────────────────────── */
  function refreshPendingCount() {
    if (!window.OfflineDB) return;
    window.OfflineDB.getPendingCount().then(function (n) {
      updateBadge(n);
    }).catch(function () {});
  }

  /* ─────────────────────────────────────────────────────
     ONLINE / OFFLINE DETECTION
  ───────────────────────────────────────────────────── */
  function handleOffline() {
    _isOnline = false;
    createOfflineBar();
    showBar('', 'You\'re offline — showing cached data');
    refreshPendingCount();
    console.info('[OfflineSync] Went offline');
  }

  function handleOnline() {
    _isOnline = true;
    console.info('[OfflineSync] Back online — starting sync');
    showBar('syncing', 'Back online — syncing changes…');
    updateBadge(_pendingCount);

    // Small delay so the server has time to be reachable
    setTimeout(function () {
      runSyncQueue().then(function (synced) {
        if (synced > 0) {
          showBar('synced', '✓ All changes synced successfully');
          setTimeout(hideBar, 3000);
          if (typeof toast === 'function') {
            toast('✓ ' + synced + ' offline change' + (synced !== 1 ? 's' : '') + ' synced to server', 'success', 'cloud_done');
          }
        } else {
          hideBar();
        }
      }).catch(function (err) {
        console.warn('[OfflineSync] Sync failed:', err);
        hideBar();
      });
    }, 1500);
  }

  window.addEventListener('offline', handleOffline);
  window.addEventListener('online',  handleOnline);

  /* ─────────────────────────────────────────────────────
     SYNC QUEUE RUNNER
     Replays each queued action to the server via sheetsFetch
  ───────────────────────────────────────────────────── */
  function runSyncQueue() {
    if (_syncInProgress) return Promise.resolve(0);
    if (!window.OfflineDB) return Promise.resolve(0);
    _syncInProgress = true;

    return window.OfflineDB.getPendingQueue().then(function (items) {
      if (!items || !items.length) {
        _syncInProgress = false;
        updateBadge(0);
        return 0;
      }

      var remaining = items.slice();
      var synced = 0;

      function processNext() {
        if (!remaining.length) {
          _syncInProgress = false;
          updateBadge(0);
          return synced;
        }

        var item = remaining.shift();

        return replayAction(item).then(function (ok) {
          if (ok) {
            synced++;
            return window.OfflineDB.removeQueueItem(item.qid).then(processNext);
          } else {
            // Leave failed items in queue for next attempt
            return processNext();
          }
        }).catch(function () {
          return processNext();
        });
      }

      return processNext();
    }).catch(function (err) {
      _syncInProgress = false;
      console.warn('[OfflineSync] Queue read error:', err);
      return 0;
    });
  }

  /**
   * Replay a single queued action back to the server.
   * Uses the same sheetsFetch used by window.API.
   */
  function replayAction(item) {
    if (!window.sheetsFetchDirect) return Promise.resolve(false);

    return window.sheetsFetchDirect(item.params).then(function (resp) {
      if (resp && resp.success) {
        console.info('[OfflineSync] Replayed:', item.params.action, '→ OK');
        return true;
      }
      // If duplicate, consider it success (already exists)
      if (resp && resp.error === 'duplicate') return true;
      console.warn('[OfflineSync] Replay failed:', item.params.action, resp);
      return false;
    }).catch(function (e) {
      console.warn('[OfflineSync] Replay error:', e);
      return false;
    });
  }

  /* ─────────────────────────────────────────────────────
     INTERCEPT SHEETS-API WRITES WHEN OFFLINE
     Called by sheets-api.js before making a JSONP request.
     Returns true if the action was queued (caller should not
     proceed with the real network call).
  ───────────────────────────────────────────────────── */
  var WRITE_ACTIONS = [
    'createPatient', 'updatePatient', 'deletePatient',
    'createSkinPatient', 'updateSkinPatient', 'deleteSkinPatient',
    'createOrthoPatient', 'updateOrthoPatient', 'deleteOrthoPatient',
    'createAppointment', 'updateAppointment',
    'createOpdEntry'
  ];

  window.OfflineSync = {

    isOnline: function () { return _isOnline; },

    /**
     * Called by sheets-api.js before every JSONP request.
     * If offline AND action is a write → queue it, return true.
     */
    interceptWrite: function (params) {
      if (_isOnline) return false;
      if (!params || !params.action) return false;
      if (WRITE_ACTIONS.indexOf(params.action) === -1) return false;

      if (window.OfflineDB) {
        window.OfflineDB.queueAction({ type: params.action, params: params })
          .then(function () {
            refreshPendingCount();
          })
          .catch(function (e) {
            console.warn('[OfflineSync] Failed to queue action:', e);
          });
      }

      console.info('[OfflineSync] Queued offline action:', params.action);
      return true;
    },

    /**
     * Called after a successful API read to persist data to IDB.
     */
    persistFetch: function (action, data) {
      if (!window.OfflineDB || !data || !data.length) return;
      if (action === 'getPatients') {
        window.OfflineDB.savePatients(data).catch(function () {});
      } else if (action === 'getSkinPatients') {
        window.OfflineDB.saveSkinPatients(data).catch(function () {});
      } else if (action === 'getOrthoPatients') {
        window.OfflineDB.saveOrthoPatients(data).catch(function () {});
      } else if (action === 'getAppointments') {
        window.OfflineDB.saveAppointments(data).catch(function () {});
      }
    },

    /**
     * Fallback read from IDB when network fails.
     * Returns a Promise resolving to { success, data, offline:true }
     */
    fallbackRead: function (action) {
      if (!window.OfflineDB) return Promise.resolve(null);
      var getter = null;
      if (action === 'getPatients')      getter = window.OfflineDB.getPatients;
      if (action === 'getSkinPatients')  getter = window.OfflineDB.getSkinPatients;
      if (action === 'getOrthoPatients') getter = window.OfflineDB.getOrthoPatients;
      if (action === 'getAppointments')  getter = window.OfflineDB.getAppointments;
      if (!getter) return Promise.resolve(null);

      return getter().then(function (rows) {
        if (rows && rows.length) {
          return { success: true, data: rows, offline: true };
        }
        return null;
      }).catch(function () { return null; });
    },

    /** Manual sync trigger (from Sync now button) */
    trySyncNow: function () {
      if (!_isOnline) {
        if (typeof toast === 'function') toast('Still offline — cannot sync yet', 'warning', 'wifi_off');
        return;
      }
      var retryBtn = document.getElementById('hmsOfflineRetry');
      if (retryBtn) retryBtn.classList.add('spinning');
      showBar('syncing', 'Syncing changes…');

      runSyncQueue().then(function (synced) {
        if (retryBtn) retryBtn.classList.remove('spinning');
        if (synced > 0) {
          showBar('synced', '✓ ' + synced + ' change' + (synced !== 1 ? 's' : '') + ' synced!');
          setTimeout(hideBar, 3000);
          if (typeof toast === 'function') toast('Synced ' + synced + ' offline changes!', 'success', 'cloud_done');
        } else {
          showBar('synced', '✓ Everything is up to date');
          setTimeout(hideBar, 2000);
        }
      });
    },

    /** Show the offline bar (called externally if needed) */
    showOfflineBar:  function (msg) { showBar('', msg || 'You\'re offline — showing cached data'); },
    /** Hide the bar */
    hideOfflineBar: hideBar
  };

  /* ─────────────────────────────────────────────────────
     INIT — check initial state
  ───────────────────────────────────────────────────── */
  function init() {
    createOfflineBar();
    if (!navigator.onLine) {
      handleOffline();
    }
    // Always refresh badge count on load
    refreshPendingCount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
