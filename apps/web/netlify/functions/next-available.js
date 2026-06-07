import { createClient } from '@supabase/supabase-js';
import { computeNextAvailable } from '../../server/nextAvailable.js';

function json(statusCode, body) {
  return {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    statusCode,
  };
}

function createServerSupabase(env) {
  const url = env?.SUPABASE_URL || env?.VITE_SUPABASE_URL;
  const key = env?.SUPABASE_SERVICE_ROLE_KEY || env?.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Server Supabase environment is missing.');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  let body = {};
  try {
    const raw = event.body || '{}';
    body = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const lat = body.lat !== undefined ? Number(body.lat) : null;
  const lng = body.lng !== undefined ? Number(body.lng) : null;
  const radiusM = body.radiusM !== undefined ? Number(body.radiusM) : null;
  const serviceId = body.serviceId || '';
  const topN = body.topN !== undefined ? Number(body.topN) : 10;

  if (lat === null || isNaN(lat) || lng === null || isNaN(lng) || radiusM === null || isNaN(radiusM)) {
    return json(400, { error: 'lat, lng, and radiusM are required numbers' });
  }

  if (!serviceId) {
    return json(400, { error: 'serviceId is required' });
  }

  try {
    const supabase = createServerSupabase(process.env);
    const slots = await computeNextAvailable({
      supabase,
      lat,
      lng,
      radiusM,
      serviceId,
      topN,
    });
    return json(200, { slots });
  } catch (error) {
    const message = (error && error.message) || 'Next-available check failed.';
    return json(500, { error: message });
  }
}
