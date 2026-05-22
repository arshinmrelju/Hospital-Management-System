import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  getDocs,
  limit
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let db = null;

export function initAuditLogger(app) {
  db = getFirestore(app);
}

function getUserInfo() {
  try {
    const raw = sessionStorage.getItem('hms_session');
    if (raw) {
      const u = JSON.parse(raw);
      return { userId: u.uid || 'unknown', userEmail: u.email || 'unknown', userRole: u.role || 'unknown' };
    }
  } catch (e) { /* ignore */ }
  return { userId: 'unknown', userEmail: 'unknown', userRole: 'unknown' };
}

export async function logAuditEvent(action, resourceType, resourceId, details = {}) {
  if (!db) return;
  const user = getUserInfo();
  try {
    await addDoc(collection(db, 'audit_logs'), {
      ...user,
      action,
      resourceType,
      resourceId: resourceId || null,
      details: JSON.stringify(details),
      ip: 'client-side',
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent
    });
  } catch (e) {
    console.warn('Audit log failed (non-blocking):', e.message);
  }
}

export async function getAuditLogs(actionFilter = null, maxResults = 100) {
  if (!db) return [];
  const constraints = [orderBy('timestamp', 'desc'), limit(maxResults)];
  if (actionFilter) {
    constraints.unshift(where('action', '==', actionFilter));
  }
  const q = query(collection(db, 'audit_logs'), ...constraints);
  const snap = await getDocs(q);
  const results = [];
  snap.forEach(d => results.push({ id: d.id, ...d.data() }));
  return results;
}

/* Convenience wrappers */
export function logLogin(userId) {
  return logAuditEvent('LOGIN', 'auth', userId);
}

export function logLogout(userId) {
  return logAuditEvent('LOGOUT', 'auth', userId);
}

export function logPatientView(patientId, patientName) {
  return logAuditEvent('PATIENT_VIEW', 'patients', patientId, { patientName });
}

export function logPatientCreate(patientId, patientName) {
  return logAuditEvent('PATIENT_CREATE', 'patients', patientId, { patientName });
}

export function logPatientUpdate(patientId, patientName) {
  return logAuditEvent('PATIENT_UPDATE', 'patients', patientId, { patientName });
}

export function logPatientDelete(patientId, patientName) {
  return logAuditEvent('PATIENT_DELETE', 'patients', patientId, { patientName });
}

export function logPrescriptionCreate(rxId, patientName) {
  return logAuditEvent('PRESCRIPTION_CREATE', 'prescriptions', rxId, { patientName });
}

export function logTransactionCreate(txnId, amount) {
  return logAuditEvent('TRANSACTION_CREATE', 'transactions', txnId, { amount });
}

export function logInvoiceCreate(invId, amount) {
  return logAuditEvent('INVOICE_CREATE', 'invoices', invId, { amount });
}

export function logAccessDenied(resource, userId, role) {
  return logAuditEvent('ACCESS_DENIED', resource, null, { userId, role });
}
