function mapGeocodingRow(row) {
  if (!row) return null;

  return {
    lat: Number(row.lat),
    lng: Number(row.lon),
    displayName: row.display_name || '',
  };
}

function geocodingSearchUrl(address, limit) {
  return `https://nominatim.openstreetmap.org/search?format=json&limit=${limit}&q=${encodeURIComponent(address)}`;
}

export async function geocodeAddress(address) {
  if (!address.trim()) return null;

  const response = await fetch(geocodingSearchUrl(address, 1));

  if (!response.ok) {
    throw new Error('Could not geocode that address.');
  }

  const rows = await response.json();
  if (!rows?.[0]) return null;

  return mapGeocodingRow(rows[0]);
}

export async function suggestAddresses(query) {
  const cleaned = query.trim();
  if (cleaned.length < 3) return [];

  const response = await fetch(geocodingSearchUrl(cleaned, 5));

  if (!response.ok) {
    throw new Error('Could not load address suggestions.');
  }

  const rows = await response.json();
  return (rows || []).map(mapGeocodingRow).filter(Boolean);
}

export async function reverseGeocodeLocation({ lat, lng }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,
  );

  if (!response.ok) {
    throw new Error('Could not refresh your location label.');
  }

  return mapGeocodingRow(await response.json());
}
