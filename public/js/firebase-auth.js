import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAsdbCJ0vXaLAMmGmxpGkXz4Zd_OR4wzAA',
  authDomain: 'wellnessplpy.firebaseapp.com',
  projectId: 'wellnessplpy',
  storageBucket: 'wellnessplpy.firebasestorage.app',
  messagingSenderId: '793276474494',
  appId: '1:793276474494:web:2a0591af677fd511f6242f',
  measurementId: 'G-WTGQMNEK28'
};

const app = initializeApp(firebaseConfig, 'wellness-auth');
const auth = getAuth(app);
const db = getFirestore(app);

window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseApp = app;

const ROLE_REDIRECTS = {
  Admin: 'admin-dashboard.html',
  Doctor: 'doctor-dashboard.html',
  Staff: 'reception-dashboard.html',
  Pharmacist: 'pharmacy-dashboard.html',
  'Lab Tech': 'lab-dashboard.html'
};

export async function authLogin(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = await fetchUserProfile(cred.user.uid);
  return { uid: cred.user.uid, ...user };
}

export async function authLogout() {
  await signOut(auth);
  sessionStorage.clear();
}

export function onAuthChange(callback) {
  onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      const profile = await fetchUserProfile(firebaseUser.uid);
      callback({ uid: firebaseUser.uid, email: firebaseUser.email, ...profile });
    } else {
      callback(null);
    }
  });
}

export async function fetchUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      return snap.data();
    }
  } catch (e) { /* ignore */ }
  return null;
}

export async function createUserProfile(uid, data) {
  await setDoc(doc(db, 'users', uid), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export function getRedirectForRole(role) {
  return ROLE_REDIRECTS[role] || 'dashboard.html';
}

export { auth, db, signInWithEmailAndPassword, sendPasswordResetEmail };
