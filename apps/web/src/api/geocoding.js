// Geocoding client. Customer-facing address autocomplete goes through a
// server-side Google Places proxy (/api/places/*) so the GOOGLE_PLACES_API_KEY
// stays out of the browser bundle. Reverse-geocoding (current location ->
// pretty address label) is still on OSM/Nominatim because it's a low-volume
// call where free is plenty and the existing label format is preserved.

const PLACES_AUTOCOMPLETE_ENDPOINT = '/api/places/autocomplete';
const PLACES_DETAILS_ENDPOINT = '/api/places/details';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

const US_STATE_ABBREVIATIONS = Object.freeze({
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
});

function abbreviateState(stateName = '') {
  const cleaned = String(stateName || '').trim().toLowerCase();
  return US_STATE_ABBREVIATIONS[cleaned] || stateName || '';
}

function mapGooglePlaceDetails(place) {
  if (!place) return null;
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    displayName: place.displayName || '',
  };
}

function mapGoogleSuggestion(suggestion) {
  if (!suggestion?.placeId) return null;
  const main = suggestion.mainText || '';
  const secondary = suggestion.secondaryText || '';
  return {
    placeId: suggestion.placeId,
    displayName: suggestion.displayName || [main, secondary].filter(Boolean).join(', '),
    mainText: main,
    secondaryText: secondary,
  };
}

async function readErrorBody(response) {
  try {
    const payload = await response.json();
    return payload?.error || '';
  } catch {
    return '';
  }
}

export async function suggestAddresses(query, { near, fetcher = fetch } = {}) {
  const cleaned = String(query || '').trim();
  if (cleaned.length < 3) return [];

  const response = await fetcher(PLACES_AUTOCOMPLETE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: cleaned,
      near: near ? { lat: near.lat, lng: near.lng } : null,
    }),
  });

  if (!response.ok) {
    throw new Error((await readErrorBody(response)) || 'Could not load address suggestions.');
  }

  const payload = await response.json().catch(() => ({}));
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  return suggestions.map(mapGoogleSuggestion).filter(Boolean);
}

export async function resolvePlace(placeId, { fetcher = fetch } = {}) {
  const cleaned = String(placeId || '').trim();
  if (!cleaned) return null;

  const response = await fetcher(
    `${PLACES_DETAILS_ENDPOINT}?placeId=${encodeURIComponent(cleaned)}`,
  );

  if (!response.ok) {
    throw new Error((await readErrorBody(response)) || 'Could not look up that address.');
  }

  const payload = await response.json().catch(() => ({}));
  return mapGooglePlaceDetails(payload?.place);
}

// Used by the form submit path when the customer typed an address but never
// clicked a suggestion. Resolves to lat/lng by taking the top autocomplete
// match and looking up its details.
export async function geocodeAddress(address, { near, fetcher = fetch } = {}) {
  const cleaned = String(address || '').trim();
  if (!cleaned) return null;

  const suggestions = await suggestAddresses(cleaned, { near, fetcher });
  if (!suggestions.length) return null;

  return resolvePlace(suggestions[0].placeId, { fetcher });
}

export async function reverseGeocodeLocation({ lat, lng }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    lat: String(lat),
    lon: String(lng),
  });
  const response = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Could not refresh your location label.');
  }

  const row = await response.json();
  const address = row?.address || {};
  const street = [address.house_number, address.road].filter(Boolean).join(' ');
  const locality =
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.borough ||
    address.suburb ||
    '';
  const stateZip = [abbreviateState(address.state), address.postcode]
    .filter(Boolean)
    .join(' ')
    .trim();
  const composed = [street, locality, stateZip].filter(Boolean).join(', ');

  return {
    lat: Number(row.lat),
    lng: Number(row.lon),
    displayName: composed || row?.display_name || '',
  };
}
