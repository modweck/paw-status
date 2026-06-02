import { handleGroomerBusinessLinkEvent } from '../../server/groomerBusiness.js';

export async function handler(event) {
  // TODO(backend): Move behind apps/api once the proper backend owns auth,
  // rate limits, and abuse controls for groomer-initiated business creation.
  return handleGroomerBusinessLinkEvent(event, process.env);
}
