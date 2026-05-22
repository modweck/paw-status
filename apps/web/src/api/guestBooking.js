export const PENDING_GUEST_CLAIM_STORAGE_KEY = 'paw-status:pending-guest-claim';

async function readJsonResponse(response) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || 'Guest booking request failed.');
  }

  return body;
}

export async function createGuestBookingRequest(payload) {
  const response = await fetch('/api/guest-booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return readJsonResponse(response);
}

export async function claimGuestBookingRequest({ accessToken, claimToken }) {
  if (!accessToken) {
    throw new Error('Sign in before saving this guest booking.');
  }

  const response = await fetch('/api/guest-booking-claim', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ claimToken }),
  });

  return readJsonResponse(response);
}
