// Client wrappers for the groomer business-lookup endpoints. Both require the
// signed-in groomer's Supabase access token (the server gates on it).
async function readJsonResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || fallbackMessage);
  }
  return body;
}

export async function searchGroomerBusinesses(accessToken, query) {
  if (!accessToken) {
    throw new Error('Sign in to search for your business.');
  }

  const response = await fetch('/api/groomer-business-search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const body = await readJsonResponse(response, 'Business search failed.');
  return Array.isArray(body.results) ? body.results : [];
}

export async function linkGroomerBusiness(accessToken, placeId) {
  if (!accessToken) {
    throw new Error('Sign in to add your business.');
  }

  const response = await fetch('/api/groomer-business-link', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ placeId }),
  });

  const body = await readJsonResponse(response, 'Could not add that business.');
  return body.groomer || null;
}
