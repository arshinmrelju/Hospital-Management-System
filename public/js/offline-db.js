/* =========================================================
   OFFLINE-DB.JS — HMS IndexedDB Offline Storage Layer
   =========================================================
   Stores all HMS data locally in IndexedDB (no TTL — persists
   indefinitely until explicitly cleared or replaced by a fresh
   server response).  Also maintains a SYNC QUEUE so that write
   operations made while offline are replayed when internet returns.
   ========================================================= */

'use strict';

(function () {

  var DB_NAME    = 'WellnessHMSOffline';
  var DB_VERSION = 1;
  var db         = null;

  // Store names
  var STORES = {
    patients:     'patients',
    skinPatients: 'skinPatients',
    orthoPatients:'orthoPatients',
    opdRecords:   'opdRecords',
    appointments: 'appointments',
    meta:         'meta',
    syncQueue:    'syncQueue'
  };

  /* ---------- Open / Init ---------- */
  function openDB() {
    return new Promise(function (resolve, reject) {
      if (db) { resolve(db); return; }

      var req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = function (e) {
        var d = e.target.result;

        // Patient stores — keyed by their id
        if (!d.objectStoreNames.contains(STORES.patients))
          d.createObjectStore(STORES.patients, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORES.skinPatients))
          d.createObjectStore(STORES.skinPatients, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STORES.orthoPatients))
          d.createObjectStore(STORES.orthoPatients, { keyPath: 'id' });

        // OPD records
        if (!d.objectStoreNames.contains(STORES.opdRecords))
          d.createObjectStore(STORES.opdRecords, { keyPath: 'id' });

        // Appointments
        if (!d.objectStoreNames.contains(STORES.appointments))
          d.createObjectStore(STORES.appointments, { keyPath: 'id' });

        // Metadata / timestamps
        if (!d.objectStoreNames.contains(STORES.meta))
          d.createObjectStore(STORES.meta, { keyPath: 'key' });

        // Sync queue — auto-increment key
        if (!d.objectStoreNames.contains(STORES.syncQueue))
          d.createObjectStore(STORES.syncQueue, { autoIncrement: true, keyPath: 'qid' });
      };

      req.onsuccess  = function (e) { db = e.target.result; resolve(db); };
      req.onerror    = function (e) { reject(e.target.error); };
      req.onblocked  = function ()  { reject(new Error('IndexedDB blocked')); };
    });
  }

  /* ---------- Generic helpers ---------- */
  function tx(storeName, mode, fn) {
    return openDB().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t   = d.transaction([storeName], mode);
        var st  = t.objectStore(storeName);
        var req = fn(st);
        t.oncomplete = function ()  { resolve(req ? req.result : undefined); };
        t.onerror    = function (e) { reject(e.target.error); };
        t.onabort    = function (e) { reject(e.target.error); };
      });
    });
  }

  function putAll(storeName, items, idKey) {
    return openDB().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t  = d.transaction([storeName], 'readwrite');
        var st = t.objectStore(storeName);
        // Clear first, then add all fresh
        st.clear();
        items.forEach(function (item) {
          var record = Object.assign({}, item);
          // Ensure the keyPath 'id' is present
          if (!record.id && idKey && record[idKey]) record.id = String(record[idKey]);
          st.put(record);
        });
        t.oncomplete = function ()  { resolve(items.length); };
        t.onerror    = function (e) { reject(e.target.error); };
      });
    });
  }

  function getAll(storeName) {
    return openDB().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t   = d.transaction([storeName], 'readonly');
        var st  = t.objectStore(storeName);
        var req = st.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror   = function (e) { reject(e.target.error); };
      });
    });
  }

  function putMeta(key, value) {
    return tx(STORES.meta, 'readwrite', function (st) {
      return st.put({ key: key, value: value, ts: Date.now() });
    });
  }

  /* =========================================================
     PUBLIC API — window.OfflineDB
     ========================================================= */

  window.OfflineDB = {

    /* ---------- Is IndexedDB available? ---------- */
    isAvailable: function () {
      return typeof indexedDB !== 'undefined';
    },

    /* ---------- PATIENTS ---------- */
    savePatients: function (data) {
      if (!data || !data.length) return Promise.resolve(0);
      return putAll(STORES.patients, data, 'op_no')
        .then(function (n) {
          putMeta('patients_saved_at', Date.now());
          return n;
        });
    },

    getPatients: function () {
      return getAll(STORES.patients);
    },

    /* ---------- SKIN PATIENTS ---------- */
    saveSkinPatients: function (data) {
      if (!data || !data.length) return Promise.resolve(0);
      return putAll(STORES.skinPatients, data, 'skin_id')
        .then(function (n) {
          putMeta('skin_patients_saved_at', Date.now());
          return n;
        });
    },

    getSkinPatients: function () {
      return getAll(STORES.skinPatients);
    },

    /* ---------- ORTHO PATIENTS ---------- */
    saveOrthoPatients: function (data) {
      if (!data || !data.length) return Promise.resolve(0);
      return putAll(STORES.orthoPatients, data, 'ortho_id')
        .then(function (n) {
          putMeta('ortho_patients_saved_at', Date.now());
          return n;
        });
    },

    getOrthoPatients: function () {
      return getAll(STORES.orthoPatients);
    },

    /* ---------- OPD RECORDS ---------- */
    saveOpdRecords: function (data) {
      if (!data || !data.length) return Promise.resolve(0);
      return putAll(STORES.opdRecords, data, 'id');
    },

    getOpdRecords: function () {
      return getAll(STORES.opdRecords);
    },

    /* ---------- APPOINTMENTS ---------- */
    saveAppointments: function (data) {
      if (!data || !data.length) return Promise.resolve(0);
      return putAll(STORES.appointments, data, 'id');
    },

    getAppointments: function () {
      return getAll(STORES.appointments);
    },

    /* ---------- SYNC QUEUE ---------- */

    /**
     * Queue an offline action for later sync.
     * @param {Object} action  { type, params, ts }
     *   type: 'createPatient' | 'updatePatient' | 'deletePatient' |
     *         'createSkinPatient' | 'updateSkinPatient' | 'deleteSkinPatient' |
     *         'createOrthoPatient' | 'updateOrthoPatient' | 'deleteOrthoPatient' |
     *         'createAppointment' | 'createOpdEntry'
     *   params: the same params object that would go to sheetsFetch
     */
    queueAction: function (action) {
      return tx(STORES.syncQueue, 'readwrite', function (st) {
        return st.add(Object.assign({ ts: Date.now() }, action));
      });
    },

    /** Get all pending sync queue items */
    getPendingQueue: function () {
      return getAll(STORES.syncQueue);
    },

    /** Remove a single queued item by its auto-incremented key */
    removeQueueItem: function (qid) {
      return tx(STORES.syncQueue, 'readwrite', function (st) {
        return st.delete(qid);
      });
    },

    /** Remove all queued items (after successful bulk sync) */
    clearQueue: function () {
      return tx(STORES.syncQueue, 'readwrite', function (st) {
        return st.clear();
      });
    },

    /** How many items are pending sync */
    getPendingCount: function () {
      return openDB().then(function (d) {
        return new Promise(function (resolve, reject) {
          var t   = d.transaction([STORES.syncQueue], 'readonly');
          var st  = t.objectStore(STORES.syncQueue);
          var req = st.count();
          req.onsuccess = function () { resolve(req.result || 0); };
          req.onerror   = function (e) { reject(e.target.error); };
        });
      });
    },

    /* ---------- Metadata helpers ---------- */
    getLastSavedAt: function (key) {
      return openDB().then(function (d) {
        return new Promise(function (resolve) {
          var t   = d.transaction([STORES.meta], 'readonly');
          var st  = t.objectStore(STORES.meta);
          var req = st.get(key + '_saved_at');
          req.onsuccess = function () {
            resolve(req.result ? req.result.value : null);
          };
          req.onerror = function () { resolve(null); };
        });
      });
    },

    /* ---------- Eager init ---------- */
    init: function () {
      return openDB().catch(function (err) {
        console.warn('[OfflineDB] IndexedDB unavailable:', err);
      });
    }
  };

  // Eagerly open the DB on script load so it is ready
  window.OfflineDB.init();

})();
