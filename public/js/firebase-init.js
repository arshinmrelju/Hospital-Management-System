'use strict';

(function() {
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyAsdbCJ0vXaLAMmGmxpGkXz4Zd_OR4wzAA",
    authDomain: "wellnessplpy.firebaseapp.com",
    projectId: "wellnessplpy",
    storageBucket: "wellnessplpy.firebasestorage.app",
    messagingSenderId: "793276474494",
    appId: "1:793276474494:web:2a0591af677fd511f6242f",
    measurementId: "G-WTGQMNEK28"
  };

  var initPromise = null;

  function initFirebase() {
    if (initPromise) return initPromise;

    initPromise = new Promise(function(resolve) {
      if (typeof firebase === 'undefined') {
        console.warn('[Firebase] SDK not loaded. Login history unavailable.');
        resolve(null);
        return;
      }

      try {
        if (!firebase.apps.length) {
          firebase.initializeApp(FIREBASE_CONFIG);
        }

        var app = firebase.app();
        window.db = firebase.firestore();
        window.db.settings({ merge: true });

        firebase.auth().signInAnonymously().then(function(result) {
          console.info('[Firebase] Anonymous auth ready.');
          resolve(window.db);
        }).catch(function(err) {
          console.warn('[Firebase] Anonymous auth failed:', err.message);
          resolve(window.db);
        });
      } catch (e) {
        console.warn('[Firebase] Init error:', e.message);
        resolve(null);
      }
    });

    return initPromise;
  }

  window.FIREBASE_READY = initFirebase();

  window.logLoginEvent = function(user, role, portal) {
    return window.FIREBASE_READY.then(function(db) {
      if (!db) return null;
      var uid = (firebase.auth().currentUser && firebase.auth().currentUser.uid) || 'unknown';
      var doc = {
        userId: uid,
        user: user,
        role: role,
        portal: portal,
        loginTime: firebase.firestore.FieldValue.serverTimestamp(),
        lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        deviceInfo: (navigator.userAgent || '').slice(0, 300)
      };
      return db.collection('login_history').add(doc).then(function(ref) {
        localStorage.setItem('hms_session_id', ref.id);
        localStorage.setItem('hms_session_time', String(Date.now()));
        return ref.id;
      });
    }).catch(function(err) {
      console.warn('[Firebase] Failed to log login:', err.message);
      return null;
    });
  };

  window.updateSessionStatus = function(status) {
    var sessionId = localStorage.getItem('hms_session_id');
    if (!sessionId) return Promise.resolve(null);

    return window.FIREBASE_READY.then(function(db) {
      if (!db) return null;

      var loginTime = parseInt(localStorage.getItem('hms_session_time') || '0', 10);
      var update = {
        lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
        status: status
      };

      if (loginTime && status !== 'active') {
        update.sessionDuration = Date.now() - loginTime;
      }

      return db.collection('login_history').doc(sessionId).update(update).then(function() {
        localStorage.removeItem('hms_session_id');
        localStorage.removeItem('hms_session_time');
      });
    }).catch(function(err) {
      console.warn('[Firebase] Failed to update session:', err.message);
    });
  };

  var HEARTBEAT_MS = 60000;
  var heartbeatTimer = null;

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(function() {
      var sessionId = localStorage.getItem('hms_session_id');
      if (!sessionId) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        return;
      }
      window.FIREBASE_READY.then(function(db) {
        if (!db) return;
        db.collection('login_history').doc(sessionId).update({
          lastActivity: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function() {});
      });
    }, HEARTBEAT_MS);
  }

  function checkSessionExpiry() {
    var sessionId = localStorage.getItem('hms_session_id');
    var sessionTime = parseInt(localStorage.getItem('hms_session_time') || '0', 10);
    if (sessionId && sessionTime && Date.now() - sessionTime > 12 * 60 * 60 * 1000) {
      window.updateSessionStatus('expired');
    }
  }

  ['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(function(evt) {
    document.addEventListener(evt, function() { startHeartbeat(); }, { once: true, passive: true });
  });

  checkSessionExpiry();
})();
