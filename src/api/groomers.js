import { getSupabaseClient } from '../lib/supabaseClient.js';

export function detectNeighborhood(address = '') {
  const normalized = address.toLowerCase();
  if (normalized.includes('84th') || normalized.includes('lexington')) return 'Upper East Side';
  if (normalized.includes('mercer') || normalized.includes('soho')) return 'SoHo';
  if (normalized.includes('8th ave') || normalized.includes('midtown')) return 'Midtown';
  return 'NYC';
}

export function formatDistance(meters) {
  if (!Number.isFinite(Number(meters))) return '';
  return `${(Number(meters) / 1609.34).toFixed(1)} mi`;
}

export function isOwnedPhotoUrl(photoUrl = '') {
  if (!photoUrl) return false;
  const normalized = String(photoUrl).toLowerCase();
  return !(
    normalized.includes('places.googleapis.com') ||
    normalized.includes('maps.googleapis.com') ||
    normalized.includes('googleusercontent.com') ||
    normalized.includes('key=')
  );
}

function normalizeServices(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((service) => String(service || '').trim())
    .filter(Boolean);
}

export function mapNearbyGroomer(row) {
  const address = row.address || '';
  const googlePlaceId = row.google_place_id || '';
  const ownedPhotoUrl = isOwnedPhotoUrl(row.photo_url) ? row.photo_url : '';

  return {
    id: row.id || googlePlaceId || row.name,
    googlePlaceId,
    name: row.name,
    salon: row.salon || row.name,
    address,
    neighborhood: row.neighborhood || detectNeighborhood(address),
    rating: row.rating ? Number(row.rating).toFixed(1) : 'New',
    reviewCount: row.review_count || 0,
    distanceLabel: formatDistance(row.distance_meters),
    nextAvailable: row.next_available || 'TBD',
    phone: row.phone || '',
    photoUrl: ownedPhotoUrl,
    photoSource: ownedPhotoUrl ? 'owned' : googlePlaceId ? 'google' : 'none',
    services: normalizeServices(row.services),
    website: row.website || '',
  };
}

function shouldRetryWithoutService(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('nearby_groomers') && message.includes('service_id');
}

export async function fetchNearbyGroomers({ lat, lng, radiusMeters, serviceId = '' }) {
  if (!lat || !lng) {
    return [];
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return [];
  }

  const params = {
    user_lat: lat,
    user_lng: lng,
    radius_meters: radiusMeters,
  };

  if (serviceId) {
    params.service_id = serviceId;
  }

  let { data, error } = await supabase.rpc('nearby_groomers', params);

  if (error && serviceId && shouldRetryWithoutService(error)) {
    ({ data, error } = await supabase.rpc('nearby_groomers', {
      user_lat: lat,
      user_lng: lng,
      radius_meters: radiusMeters,
    }));
  }

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map(mapNearbyGroomer);
}
