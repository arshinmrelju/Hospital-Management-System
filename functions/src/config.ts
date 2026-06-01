export const CONFIG = {
  // Google People API rate limit: 100 queries per 100 seconds per user
  // We use a conservative 1.5s delay between individual API calls
  API_DELAY_MS: 1500,

  // How many sync operations to process per batch
  BATCH_SIZE: 5,

  // Delay between batches (30s)
  BATCH_DELAY_MS: 30000,

  // Retry settings
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 60000,

  // Firestore collections
  COLLECTIONS: {
    PATIENTS: 'patients',
    SYNC_LOGS: 'sync_logs',
    SYNC_CONFIG: 'sync_config',
  },

  // Default delegated admin email for Google Workspace
  // The service account will impersonate this user to access People API
  // Admin must set this in Firestore: sync_config > settings > delegatedAdminEmail
  DEFAULT_DELEGATED_ADMIN: 'admin@wellnessmedicals.com',

  // OAuth scopes needed
  SCOPES: ['https://www.googleapis.com/auth/contacts'],
};
