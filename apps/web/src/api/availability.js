const DEFAULT_TIMEZONE = 'America/New_York';

function detectTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export async function fetchAvailableSlots(groomerId, serviceId) {
  const timezone = detectTimezone();
  const params = new URLSearchParams({ groomerId, timezone });

  if (serviceId) {
    params.set('serviceId', serviceId);
  }

  const response = await fetch(`/api/availability?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  const data = await response.json();
  return data.slots;
}
