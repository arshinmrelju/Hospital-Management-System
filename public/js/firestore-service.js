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
  limit,
  serverTimestamp,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

let db = null;

export function initDB(app) {
  db = getFirestore(app);
}

function getDB() {
  if (!db) throw new Error('Firestore not initialized. Call initDB(app) first.');
  return db;
}

/* =========================================
   GENERIC CRUD HELPERS
   ========================================= */

export async function createDoc(collectionName, data, customId = null) {
  const ref = customId
    ? doc(getDB(), collectionName, customId)
    : doc(collection(getDB(), collectionName));
  const payload = { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await setDoc(ref, payload);
  return { id: ref.id, ...payload };
}

export async function updateDocById(collectionName, docId, data) {
  const ref = doc(getDB(), collectionName, docId);
  const payload = { ...data, updatedAt: serverTimestamp() };
  await updateDoc(ref, payload);
  return { id: docId, ...payload };
}

export async function deleteDocById(collectionName, docId) {
  await deleteDoc(doc(getDB(), collectionName, docId));
}

export async function getDocById(collectionName, docId) {
  const snap = await getDoc(doc(getDB(), collectionName, docId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function queryDocs(collectionName, constraints = []) {
  const q = query(collection(getDB(), collectionName), ...constraints);
  const snapshot = await getDocs(q);
  const results = [];
  snapshot.forEach(d => results.push({ id: d.id, ...d.data() }));
  return results;
}

export async function getAllDocs(collectionName) {
  return queryDocs(collectionName);
}

/* =========================================
   PATIENTS
   ========================================= */

export async function createPatient(data) {
  return createDoc('patients', data);
}

export async function updatePatient(id, data) {
  return updateDocById('patients', id, data);
}

export async function deletePatient(id) {
  return deleteDocById('patients', id);
}

export async function getPatient(id) {
  return getDocById('patients', id);
}

export async function getAllPatients() {
  return queryDocs('patients', [orderBy('lastVisit', 'desc')]);
}

export async function searchPatients(searchTerm) {
  if (!searchTerm) return getAllPatients();
  const term = searchTerm.toLowerCase();
  const all = await getAllPatients();
  return all.filter(p =>
    (p.fname || '').toLowerCase().includes(term) ||
    (p.lname || '').toLowerCase().includes(term) ||
    (p.id || '').toLowerCase().includes(term) ||
    (p.contact || '').includes(term)
  );
}

/* =========================================
   APPOINTMENTS
   ========================================= */

export async function createAppointment(data) {
  return createDoc('appointments', data);
}

export async function updateAppointment(id, data) {
  return updateDocById('appointments', id, data);
}

export async function deleteAppointment(id) {
  return deleteDocById('appointments', id);
}

export async function getAppointmentsByDate(dateStr) {
  return queryDocs('appointments', [
    where('date', '==', dateStr),
    orderBy('time', 'asc')
  ]);
}

export async function getAppointmentsByDoctor(doctorId) {
  return queryDocs('appointments', [
    where('doctorId', '==', doctorId),
    orderBy('date', 'desc'),
    orderBy('time', 'asc')
  ]);
}

export async function getAllAppointments() {
  return queryDocs('appointments', [orderBy('date', 'desc'), orderBy('time', 'asc')]);
}

/* =========================================
   PRESCRIPTIONS
   ========================================= */

export async function createPrescription(data) {
  return createDoc('prescriptions', data);
}

export async function updatePrescription(id, data) {
  return updateDocById('prescriptions', id, data);
}

export async function getPrescriptionsByPatient(patientId) {
  return queryDocs('prescriptions', [
    where('patientId', '==', patientId),
    orderBy('issuedAt', 'desc')
  ]);
}

export async function getPendingPrescriptions() {
  return queryDocs('prescriptions', [
    where('status', '==', 'pending'),
    orderBy('issuedAt', 'desc')
  ]);
}

/* =========================================
   INVENTORY
   ========================================= */

export async function getAllInventory() {
  return queryDocs('inventory', [orderBy('brandName', 'asc')]);
}

export async function searchInventory(searchTerm) {
  if (!searchTerm) return getAllInventory();
  const term = searchTerm.toLowerCase();
  const all = await getAllInventory();
  return all.filter(item =>
    (item.brandName || '').toLowerCase().includes(term) ||
    (item.content || '').toLowerCase().includes(term)
  );
}

export async function updateInventoryItem(id, data) {
  return updateDocById('inventory', id, data);
}

export async function getLowStockItems(threshold = 20) {
  return queryDocs('inventory', [
    where('stock', '<=', threshold),
    orderBy('stock', 'asc')
  ]);
}

/* =========================================
   LAB ORDERS & RESULTS
   ========================================= */

export async function createLabOrder(data) {
  return createDoc('lab_orders', data);
}

export async function updateLabOrder(id, data) {
  return updateDocById('lab_orders', id, data);
}

export async function getLabOrdersByStatus(status) {
  if (status === 'all') {
    return queryDocs('lab_orders', [orderBy('createdAt', 'desc')]);
  }
  return queryDocs('lab_orders', [
    where('status', '==', status),
    orderBy('createdAt', 'desc')
  ]);
}

export async function createLabResult(data) {
  return createDoc('lab_results', data);
}

export async function getCompletedLabResults() {
  return queryDocs('lab_results', [orderBy('createdAt', 'desc')]);
}

/* =========================================
   OPD QUEUE
   ========================================= */

export async function createOpdEntry(data) {
  return createDoc('opd_queue', data);
}

export async function updateOpdEntry(id, data) {
  return updateDocById('opd_queue', id, data);
}

export async function getOpdQueue(filters = {}) {
  const constraints = [];
  if (filters.status) {
    constraints.push(where('status', '==', filters.status));
  }
  constraints.push(orderBy('timestamp', 'asc'));
  return queryDocs('opd_queue', constraints);
}

/* =========================================
   TRANSACTIONS (Billing/UPI)
   ========================================= */

export async function createTransaction(data) {
  return createDoc('transactions', data);
}

export async function getAllTransactions() {
  return queryDocs('transactions', [orderBy('time', 'desc')]);
}

export async function updateTransaction(id, data) {
  return updateDocById('transactions', id, data);
}

/* =========================================
   INVOICES
   ========================================= */

export async function createInvoice(data) {
  return createDoc('invoices', data);
}

export async function getAllInvoices() {
  return queryDocs('invoices', [orderBy('createdAt', 'desc')]);
}

export async function updateInvoice(id, data) {
  return updateDocById('invoices', id, data);
}
