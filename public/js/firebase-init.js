import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  updatePassword,
  updateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  startAfter,
  startAt,
  limit as firestoreLimit,
  serverTimestamp,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAsdbCJ0vXaLAMmGmxpGkXz4Zd_OR4wzAA',
  authDomain: 'wellnessplpy.firebaseapp.com',
  projectId: 'wellnessplpy',
  storageBucket: 'wellnessplpy.firebasestorage.app',
  messagingSenderId: '793276474494',
  appId: '1:793276474494:web:2a0591af677fd511f6242f',
  measurementId: 'G-WTGQMNEK28'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

isSupported()
  .then((supported) => {
    if (supported) {
      window.firebaseAnalytics = getAnalytics(app);
    }
  })
  .catch(() => {});

window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseDb = db;
window.createFirebaseUser = (email, password) => createUserWithEmailAndPassword(auth, email, password);
window.sendFirebasePasswordReset = (email) => sendPasswordResetEmail(auth, email);
window.firebaseFS = {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, startAfter, startAt, limit: firestoreLimit, serverTimestamp, Timestamp
};

const functionsInstance = getFunctions(app, 'us-central1');
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  try { connectFunctionsEmulator(functionsInstance, 'localhost', 5001); } catch (e) { /* ignore */ }
}
window.firebaseFunctions = { httpsCallable: (name) => httpsCallable(functionsInstance, name) };

/* --- Auth state restoration across page loads --- */
let _authReadyResolve;
window._authReady = new Promise(resolve => { _authReadyResolve = resolve; });
window._currentFirebaseUser = null;

onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    window._currentFirebaseUser = firebaseUser;
    const existing = HMS_AUTH.getSession();
    if (!existing) {
      try {
        const profile = await HMS_AUTH.fetchProfile(firebaseUser.uid);
        if (profile) {
          HMS_AUTH.setSession({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: profile.name || firebaseUser.email.split('@')[0],
            title: profile.title || '',
            role: profile.role || 'Staff',
            redirect: HMS_AUTH.getRedirect(profile.role || 'Staff')
          });
        } else {
          // No Firestore profile document exists — auto-create one
          // using the existing session data (from login redirect).
          const fallback = HMS_AUTH.getSession();
          const defaultDoc = {
            name: fallback?.name || firebaseUser.email.split('@')[0],
            role: fallback?.role || 'Staff',
            email: firebaseUser.email,
            title: fallback?.title || fallback?.role || 'Staff',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), defaultDoc);
          HMS_AUTH.setSession({
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            name: defaultDoc.name,
            title: defaultDoc.title,
            role: defaultDoc.role,
            redirect: HMS_AUTH.getRedirect(defaultDoc.role)
          });
        }
      } catch (e) { /* ignore */ }
    } else {
      // Session exists but the Firestore profile doc may be missing.
      // Silently ensure it exists so security rules' getUserRole() works.
      try {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (!snap.exists()) {
          await setDoc(doc(db, 'users', firebaseUser.uid), {
            name: existing.name || firebaseUser.email.split('@')[0],
            role: existing.role || 'Staff',
            email: firebaseUser.email,
            title: existing.title || existing.role || 'Staff',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (e) { /* ignore */ }
    }
  } else {
    window._currentFirebaseUser = null;
    sessionStorage.removeItem('hms_session');
  }
  _authReadyResolve(true);
});

/* --- Firebase Auth user profile helpers --- */
window.getFirebaseUser = () => window._currentFirebaseUser;

window.updateFirebaseProfile = async (updates) => {
  const user = window._currentFirebaseUser;
  if (!user) throw new Error('Not authenticated');
  await updateProfile(user, updates);
};

window.updateFirebaseEmail = async (newEmail) => {
  const user = window._currentFirebaseUser;
  if (!user) throw new Error('Not authenticated');
  await updateEmail(user, newEmail);
};

window.updateFirebasePassword = async (newPassword) => {
  const user = window._currentFirebaseUser;
  if (!user) throw new Error('Not authenticated');
  await updatePassword(user, newPassword);
};

window.reauthenticateFirebaseUser = async (email, password) => {
  const user = window._currentFirebaseUser;
  if (!user) throw new Error('Not authenticated');
  const credential = EmailAuthProvider.credential(email, password);
  await reauthenticateWithCredential(user, credential);
};

window.updateUserDoc = async (uid, data) => {
  const ref = doc(db, 'users', uid || window._currentFirebaseUser?.uid);
  await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
};

/* Global sanitizer for XSS prevention */
window.esc = function esc(val) {
  if (val == null) return '';
  return String(val).replace(/[&<>"']/g, function(m) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
  });
};

const ROLE_REDIRECTS = {
  Admin: 'admin-dashboard.html',
  Doctor: 'doctor-dashboard.html',
  Staff: 'reception-dashboard.html',
  Pharmacist: 'pharmacy-dashboard.html',
  'Lab Tech': 'lab-dashboard.html'
};

const HMS_AUTH = {
  async login(email, password) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const profile = await this.fetchProfile(cred.user.uid);
    return { uid: cred.user.uid, email: cred.user.email, ...profile };
  },

  async logout() {
    await signOut(auth);
    sessionStorage.removeItem('hms_session');
    location.href = 'index.html';
  },

  async fetchProfile(uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) return snap.data();
    } catch (e) { /* ignore */ }
    return null;
  },

  getSession() {
    try {
      return JSON.parse(sessionStorage.getItem('hms_session') || 'null');
    } catch (_) { return null; }
  },

  setSession(userData) {
    sessionStorage.setItem('hms_session', JSON.stringify(userData));
  },

  requireAuth() {
    const user = this.getSession();
    if (!user) { location.href = 'index.html'; return null; }
    return user;
  },

  getRedirect(role) {
    return ROLE_REDIRECTS[role] || 'dashboard.html';
  },

  hasRole(allowedRoles) {
    const user = this.getSession();
    return user && allowedRoles.includes(user.role);
  },

  requireRole(allowedRoles) {
    const user = this.requireAuth();
    if (user && !allowedRoles.includes(user.role)) {
      location.href = ROLE_REDIRECTS[user.role] || 'dashboard.html';
      return null;
    }
    return user;
  }
};

window.HMS_AUTH = HMS_AUTH;
window.HMS = {
  getUser() { return HMS_AUTH.getSession(); },
  setUser(data) { HMS_AUTH.setSession(data); },
  logout() { HMS_AUTH.logout(); },
  requireAuth() { return HMS_AUTH.requireAuth(); }
};
