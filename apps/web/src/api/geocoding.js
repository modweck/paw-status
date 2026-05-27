// US-state abbreviation map used when shortening Nominatim address responses
// into UI-friendly labels. Keeping this local keeps geocoding self-contained.
// TODO: add US territories (PR, GU, VI, AS, MP) if the product expands beyond
// the 50 states + DC. Until then, unrecognised state names fall through to
// their full Nominatim form (see abbreviateState).
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

function buildShortDisplayName(row) {
  // Nominatim's `display_name` is a long comma-delimited path
  // ("515, East 72nd Street, Lenox Hill, Manhattan Community Board 8, ...,
  // United States"). Compose a tighter US-friendly string from the
  // structured fields when `addressdetails=1` is in the request.
  const a = row?.address || {};
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const locality = a.city || a.town || a.village || a.hamlet || a.borough || a.suburb || '';
  const state = abbreviateState(a.state);
  const stateZip = [state, a.postcode].filter(Boolean).join(' ').trim();

  const composed = [street, locality, stateZip].filter(Boolean).join(', ');
  if (composed) return composed;

  // Fall back to the full display_name if address details are missing.
  return row?.display_name || '';
}

function mapGeocodingRow(row) {
  if (!row) return null;

  return {
    lat: Number(row.lat),
    lng: Number(row.lon),
    displayName: buildShortDisplayName(row),
  };
}

// ~50 km box around a lat/lng — used as a viewbox preference for Nominatim
// ranking, NOT a hard bound. Anything inside still wins ties without
// excluding equally specific results elsewhere in the country.
const VIEWBOX_HALF_DEGREES = 0.5;

function buildViewbox(near) {
  if (!near) return '';
  const lat = Number(near.lat);
  const lng = Number(near.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const lonMin = lng - VIEWBOX_HALF_DEGREES;
  const latMax = lat + VIEWBOX_HALF_DEGREES;
  const lonMax = lng + VIEWBOX_HALF_DEGREES;
  const latMin = lat - VIEWBOX_HALF_DEGREES;
  return `${lonMin},${latMax},${lonMax},${latMin}`;
}

function addressAlreadyMentions(address, hint) {
  if (!hint) return false;
  const haystack = String(address || '').toLowerCase();
  return hint
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function geocodingSearchUrl(address, limit, near, cityHint) {
  // countrycodes=us: bias to US-only for a US-only product.
  // addressdetails=1: returns structured address fields used by
  //   buildShortDisplayName to render a clean UI label.
  // dedupe=1: collapses near-duplicate Nominatim hits.
  // viewbox + bounded=0: ranks results inside the box higher without
  //   excluding the rest of the country.
  //
  // cityHint: appended to the user's query as a soft locality hint when the
  //   caller knows the bias is a default (e.g., the customer hasn't granted
  //   browser location yet). Necessary because Nominatim's viewbox only
  //   weights ties — partial queries like "515 east 72" can still surface a
  //   literal "515 East" street in Utah before the Manhattan match. Skipped
  //   when the user has already typed the city themselves.
  let query = String(address || '');
  if (cityHint && !addressAlreadyMentions(query, cityHint)) {
    query = `${query.trim()}, ${cityHint}`;
  }

  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    countrycodes: 'us',
    dedupe: '1',
    limit: String(limit),
    q: query,
  });
  const viewbox = buildViewbox(near);
  if (viewbox) {
    params.set('viewbox', viewbox);
    params.set('bounded', '0');
  }
  return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
}

export async function geocodeAddress(address, { near, cityHint } = {}) {
  if (!address.trim()) return null;

  const response = await fetch(geocodingSearchUrl(address, 1, near, cityHint));

  if (!response.ok) {
    throw new Error('Could not geocode that address.');
  }

  const rows = await response.json();
  if (!rows?.[0]) return null;

  return mapGeocodingRow(rows[0]);
}

export async function suggestAddresses(query, { near, cityHint } = {}) {
  const cleaned = query.trim();
  if (cleaned.length < 3) return [];

  const response = await fetch(geocodingSearchUrl(cleaned, 5, near, cityHint));

  if (!response.ok) {
    throw new Error('Could not load address suggestions.');
  }

  const rows = await response.json();
  return (rows || []).map(mapGeocodingRow).filter(Boolean);
}

export async function reverseGeocodeLocation({ lat, lng }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const params = new URLSearchParams({
    format: 'json',
    addressdetails: '1',
    lat: String(lat),
    lon: String(lng),
  });
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error('Could not refresh your location label.');
  }

  return mapGeocodingRow(await response.json());
}
