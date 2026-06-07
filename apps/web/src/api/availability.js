async function readJsonResponse(response) {
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(body.error || 'Failed to fetch available slots.');
  }

  return body;
}

export async function fetchAvailableSlots({ groomerId, serviceId, from, to }) {
  const params = new URLSearchParams({
    groomerId,
    serviceId,
    from,
    to,
  });

  const response = await fetch(`/api/availability?${params}`, {
    method: 'GET',
  });

  const data = await readJsonResponse(response);

  return data.slots || [];
}
