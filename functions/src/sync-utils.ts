import * as admin from 'firebase-admin';
import { CONFIG } from './config';

const db = admin.firestore();

export interface SyncConfig {
  enabled: boolean;
  delegatedAdminEmail: string;
  autoSyncNewPatients: boolean;
}

export interface SyncLogEntry {
  patientId: string;
  patientName: string;
  phone: string;
  action: 'create' | 'update' | 'delete' | 'skip' | 'error';
  googleContactId: string;
  status: 'success' | 'failed';
  message: string;
  timestamp: admin.firestore.Timestamp;
  retryCount: number;
}

/**
 * Get sync configuration from Firestore.
 */
export async function getSyncConfig(): Promise<SyncConfig> {
  try {
    const doc = await db.collection(CONFIG.COLLECTIONS.SYNC_CONFIG).doc('settings').get();
    if (doc.exists) {
      const data = doc.data()!;
      return {
        enabled: data.enabled !== false,
        delegatedAdminEmail: data.delegatedAdminEmail || CONFIG.DEFAULT_DELEGATED_ADMIN,
        autoSyncNewPatients: data.autoSyncNewPatients !== false,
      };
    }
  } catch (e) {
    console.warn('Failed to read sync config, using defaults:', e);
  }
  return {
    enabled: true,
    delegatedAdminEmail: CONFIG.DEFAULT_DELEGATED_ADMIN,
    autoSyncNewPatients: true,
  };
}

/**
 * Write a sync log entry.
 */
export async function writeSyncLog(entry: Omit<SyncLogEntry, 'timestamp'>): Promise<void> {
  try {
    await db.collection(CONFIG.COLLECTIONS.SYNC_LOGS).add({
      ...entry,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('Failed to write sync log:', e);
  }
}

/**
 * Check if we should skip syncing based on config and patient data.
 */
export function shouldSync(patientData: any): boolean {
  return patientData?.syncToGoogle === true;
}

/**
 * Build patient name from first + last name.
 */
export function buildPatientName(data: any): string {
  const fname = data.fname || '';
  const lname = data.lname || '';
  return `${fname} ${lname}`.trim();
}

/**
 * Get patient phone number (normalized).
 */
export function getPatientPhone(data: any): string {
  return data.contact || data.phone || '';
}

/**
 * Get patient email.
 */
export function getPatientEmail(data: any): string {
  return data.email || '';
}

/**
 * Format UHID (patient ID).
 */
export function getUhid(data: any, docId: string): string {
  return data.patientId || data.uhid || docId;
}

/**
 * Process pending failed syncs for retry.
 * Returns patients that need retry.
 */
export async function getFailedSyncsToRetry(maxRetries: number = CONFIG.MAX_RETRIES): Promise<
  Array<{ id: string; data: FirebaseFirestore.DocumentData }>
> {
  const snapshot = await db
    .collection(CONFIG.COLLECTIONS.PATIENTS)
    .where('syncToGoogle', '==', true)
    .where('syncStatus', '==', 'failed')
    .where('syncRetryCount', '<', maxRetries)
    .limit(CONFIG.BATCH_SIZE)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
}
