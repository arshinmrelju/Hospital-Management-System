import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as peopleApi from './people-api';
import * as syncUtils from './sync-utils';
import { CONFIG } from './config';

admin.initializeApp();
const db = admin.firestore();

/**
 * ============================================================
 * TRIGGER: On new patient created in Firestore
 * ============================================================
 * Automatically syncs to Google Contacts if syncToGoogle is true.
 * Rate-limited internally to avoid People API quota bans.
 */
export const onPatientCreated = functions.firestore
  .document('patients/{patientId}')
  .onCreate(async (snap, context) => {
    const patient = snap.data();
    const patientId = context.params.patientId;

    // Check if auto-sync should happen
    if (!syncUtils.shouldSync(patient)) {
      functions.logger.info(`Skipping sync for ${patientId}: syncToGoogle not enabled`);
      return;
    }

    await syncPatientToGoogle(patientId, patient);
  });

/**
 * ============================================================
 * TRIGGER: On patient updated in Firestore
 * ============================================================
 * Re-syncs if name/phone/email changed and syncToGoogle is true.
 */
export const onPatientUpdated = functions.firestore
  .document('patients/{patientId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const patientId = context.params.patientId;

    if (!syncUtils.shouldSync(after)) {
      return;
    }

    // Only re-sync if relevant fields changed
    const fieldsChanged =
      before.fname !== after.fname ||
      before.lname !== after.lname ||
      before.contact !== after.contact ||
      before.email !== after.email;

    if (!fieldsChanged) {
      return;
    }

    await syncPatientToGoogle(patientId, after);
  });

/**
 * ============================================================
 * CALLABLE: Manually sync a single patient
 * ============================================================
 * Admin can call this from the dashboard.
 */
export const manualSyncPatient = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const patientId = data.patientId;
  if (!patientId) {
    throw new functions.https.HttpsError('invalid-argument', 'patientId is required');
  }

  const doc = await db.collection('patients').doc(patientId).get();
  if (!doc.exists) {
    throw new functions.https.HttpsError('not-found', 'Patient not found');
  }

  const patient = doc.data()!;
  await syncPatientToGoogle(patientId, patient, true);

  return { success: true, message: 'Sync completed' };
});

/**
 * ============================================================
 * CALLABLE: Bulk sync all patients with syncToGoogle=true
 * ============================================================
 * Processes in small batches with delays to avoid rate limits.
 */
export const bulkSyncPatients = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const snapshot = await db
    .collection('patients')
    .where('syncToGoogle', '==', true)
    .get();

  const patients = snapshot.docs.map(d => ({ id: d.id, data: d.data() }));
  const total = patients.length;
  let synced = 0;
  let failed = 0;

  // Process in small batches with delays
  for (let i = 0; i < patients.length; i += CONFIG.BATCH_SIZE) {
    const batch = patients.slice(i, i + CONFIG.BATCH_SIZE);

    // Process each patient in the batch sequentially (with delay between)
    for (const { id, data: patient } of batch) {
      try {
        await syncPatientToGoogle(id, patient, true);
        synced++;
      } catch (e) {
        failed++;
        functions.logger.error(`Bulk sync failed for ${id}:`, e);
      }
    }

    // Delay between batches to avoid rate limiting
    if (i + CONFIG.BATCH_SIZE < patients.length) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY_MS));
    }
  }

  return {
    success: true,
    total,
    synced,
    failed,
    message: `Bulk sync complete: ${synced} synced, ${failed} failed of ${total}`,
  };
});

/**
 * ============================================================
 * SCHEDULED: Retry failed syncs every hour
 * ============================================================
 * Picks up patients with syncStatus='failed' and retries.
 */
export const retryFailedSyncs = functions.pubsub
  .schedule('every 60 minutes')
  .onRun(async context => {
    functions.logger.info('Starting retry of failed syncs...');

    const failedPatients = await syncUtils.getFailedSyncsToRetry();
    functions.logger.info(`Found ${failedPatients.length} failed syncs to retry`);

    for (const { id, data: patient } of failedPatients) {
      try {
        await syncPatientToGoogle(id, patient, true);
        functions.logger.info(`Retry succeeded for ${id}`);
      } catch (e) {
        functions.logger.error(`Retry failed for ${id}:`, e);
        // Increment retry count
        await db.collection('patients').doc(id).update({
          syncRetryCount: admin.firestore.FieldValue.increment(1),
          syncLastError: String(e),
          syncLastAttempt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // Small delay between retries
      await new Promise(resolve => setTimeout(resolve, CONFIG.API_DELAY_MS));
    }

    functions.logger.info('Retry cycle complete');
  });

/**
 * ============================================================
 * CORE: Sync a single patient to Google Contacts
 * ============================================================
 */
async function syncPatientToGoogle(
  patientId: string,
  patient: any,
  isManualOrRetry: boolean = false,
): Promise<void> {
  const name = syncUtils.buildPatientName(patient);
  const phone = syncUtils.getPatientPhone(patient);
  const email = syncUtils.getPatientEmail(patient);
  const uhid = syncUtils.getUhid(patient, patientId);

  if (!phone) {
    functions.logger.warn(`No phone for patient ${patientId}, skipping Google sync`);
    await db.collection('patients').doc(patientId).update({
      syncStatus: 'skipped',
      syncMessage: 'No phone number',
      syncLastAttempt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return;
  }

  try {
    // Get sync config (read from Firestore each time for fresh settings)
    const config = await syncUtils.getSyncConfig();
    if (!config.enabled && !isManualOrRetry) {
      functions.logger.info(`Google Sync is disabled in config, skipping ${patientId}`);
      return;
    }

    // Get People API client
    const client = await peopleApi.getPeopleClient(config.delegatedAdminEmail);

    // Search for existing contact by phone (dedup)
    const existing = await peopleApi.findContactByPhone(client, phone);

    let googleContactId: string;
    let action: 'create' | 'update';

    if (existing && existing.resourceName) {
      // Update existing contact
      googleContactId = await peopleApi.updateContact(
        client,
        existing.resourceName,
        name,
        phone,
        email,
        uhid,
        existing.etag,
      );
      action = 'update';
      functions.logger.info(`Updated Google contact for ${patientId}: ${googleContactId}`);
    } else {
      // Create new contact
      googleContactId = await peopleApi.createContact(client, name, phone, email, uhid);
      action = 'create';
      functions.logger.info(`Created Google contact for ${patientId}: ${googleContactId}`);
    }

    // Update Firestore patient record
    await db.collection('patients').doc(patientId).update({
      googleContactId,
      syncStatus: 'synced',
      syncMessage: `Contact ${action}d successfully`,
      syncLastAttempt: admin.firestore.FieldValue.serverTimestamp(),
      syncRetryCount: 0,
      syncLastError: admin.firestore.FieldValue.delete(),
    });

    // Write sync log
    await syncUtils.writeSyncLog({
      patientId,
      patientName: name,
      phone,
      action,
      googleContactId,
      status: 'success',
      message: `Google contact ${action}d`,
      retryCount: 0,
    });
  } catch (error: any) {
    functions.logger.error(`Sync failed for patient ${patientId}:`, error);

    // Update patient with error status
    const currentRetryCount = patient.syncRetryCount || 0;
    await db.collection('patients').doc(patientId).update({
      syncStatus: 'failed',
      syncMessage: `Error: ${error.message}`,
      syncLastAttempt: admin.firestore.FieldValue.serverTimestamp(),
      syncRetryCount: currentRetryCount + 1,
      syncLastError: error.message,
    });

    // Write error log
    await syncUtils.writeSyncLog({
      patientId,
      patientName: name,
      phone,
      action: 'error',
      googleContactId: patient.googleContactId || '',
      status: 'failed',
      message: `Sync failed: ${error.message}`,
      retryCount: currentRetryCount + 1,
    });

    // Re-throw for caller to handle
    throw error;
  }
}
