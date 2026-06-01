import { google, people_v1 } from 'googleapis';
import { CONFIG } from './config';

let peopleClient: people_v1.People | null = null;

/**
 * Sleep utility for rate limiting.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get or initialize the Google People API client.
 * Uses Application Default Credentials (ADC) running on Cloud Functions.
 * The service account impersonates a Google Workspace user via domain-wide delegation.
 */
export async function getPeopleClient(delegatedUserEmail?: string): Promise<people_v1.People> {
  if (peopleClient) return peopleClient;

  const auth = new google.auth.GoogleAuth({
    scopes: CONFIG.SCOPES,
  });

  const client = await auth.getClient();

  // Impersonate the delegated user for People API (domain-wide delegation)
  if (delegatedUserEmail) {
    (client as any).subject = delegatedUserEmail;
  }

  peopleClient = google.people({ version: 'v1', auth: client as any });
  return peopleClient;
}

/**
 * Search for a Google Contact by phone number.
 * Returns the first matching contact resource name, or null.
 */
export async function findContactByPhone(
  client: people_v1.People,
  phone: string,
): Promise<{ resourceName: string; etag?: string } | null> {
  // Strip non-digit characters for matching
  const digitsOnly = phone.replace(/\D/g, '');

  // Google People API searchContacts uses a query string
  const res = await client.people.searchContacts({
    query: digitsOnly,
    readMask: 'names,phoneNumbers,metadata',
    pageSize: 10,
  });

  await sleep(CONFIG.API_DELAY_MS); // rate limit

  const results = res.data.results || [];
  for (const result of results) {
    const person = result.person;
    if (!person) continue;

    const phoneNumbers = person.phoneNumbers || [];
    for (const pn of phoneNumbers) {
      const pnDigits = (pn.value || '').replace(/\D/g, '');
      // Match if the last 10 digits match (accounts for country code differences)
      if (pnDigits.endsWith(digitsOnly.slice(-10))) {
        return {
          resourceName: person.resourceName || '',
          etag: person.etag || undefined,
        };
      }
    }
  }

  return null;
}

/**
 * Create a new Google Contact.
 */
export async function createContact(
  client: people_v1.People,
  name: string,
  phone: string,
  email: string,
  uhid: string,
): Promise<string> {
  const contact: any = {
    names: [
      {
        givenName: name,
        displayName: name,
      },
    ],
    phoneNumbers: [
      {
        value: phone,
        type: 'main',
      },
    ],
    emailAddresses: email
      ? [
          {
            value: email,
            type: 'work',
          },
        ]
      : [],
    biographies: [
      {
        value: `UHID: ${uhid}\nRegistered via HMS - Wellness Medicals`,
        contentType: 'TEXT_PLAIN',
      },
    ],
  };

  const res = await client.people.createContact({
    requestBody: contact,
  });

  await sleep(CONFIG.API_DELAY_MS); // rate limit

  return res.data.resourceName || '';
}

/**
 * Update an existing Google Contact.
 */
export async function updateContact(
  client: people_v1.People,
  resourceName: string,
  name: string,
  phone: string,
  email: string,
  uhid: string,
  etag?: string,
): Promise<string> {
  const contact: any = {
    etag,
    names: [
      {
        givenName: name,
        displayName: name,
      },
    ],
    phoneNumbers: [
      {
        value: phone,
        type: 'main',
      },
    ],
    emailAddresses: email
      ? [
          {
            value: email,
            type: 'work',
          },
        ]
      : [],
    biographies: [
      {
        value: `UHID: ${uhid}\nRegistered via HMS - Wellness Medicals`,
        contentType: 'TEXT_PLAIN',
      },
    ],
  };

  const res = await client.people.updateContact({
    resourceName,
    updatePersonFields: 'names,phoneNumbers,emailAddresses,biographies',
    requestBody: contact,
  });

  await sleep(CONFIG.API_DELAY_MS); // rate limit

  return res.data.resourceName || resourceName;
}

/**
 * Delete a Google Contact.
 */
export async function deleteContact(
  client: people_v1.People,
  resourceName: string,
): Promise<void> {
  await client.people.deleteContact({
    resourceName,
  });
  await sleep(CONFIG.API_DELAY_MS);
}
