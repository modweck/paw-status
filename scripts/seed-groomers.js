#!/usr/bin/env node
// Scrape NYC dog groomers from Google Places (New) and seed the `groomers` table.
// Usage: node scripts/seed-groomers.js

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env'), 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const GOOGLE_KEY = env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SECRET = env.SUPABASE_SECRET_KEY;
if (!GOOGLE_KEY || !SUPABASE_URL || !SUPABASE_SECRET) {
  console.error('Missing env vars. Check .env');
  process.exit(1);
}

// Spread queries across NYC so we cover all 5 boroughs + major neighborhoods.
const QUERIES = [
  'dog groomer manhattan',
  'dog groomer upper east side nyc',
  'dog groomer upper west side nyc',
  'dog groomer midtown nyc',
  'dog groomer chelsea nyc',
  'dog groomer west village nyc',
  'dog groomer east village nyc',
  'dog groomer soho nyc',
  'dog groomer tribeca nyc',
  'dog groomer financial district nyc',
  'dog groomer harlem nyc',
  'dog groomer washington heights nyc',
  'dog groomer brooklyn heights',
  'dog groomer park slope brooklyn',
  'dog groomer williamsburg brooklyn',
  'dog groomer bushwick brooklyn',
  'dog groomer bed stuy brooklyn',
  'dog groomer dumbo brooklyn',
  'dog groomer cobble hill brooklyn',
  'dog groomer carroll gardens brooklyn',
  'dog groomer greenpoint brooklyn',
  'dog groomer bay ridge brooklyn',
  'dog groomer long island city queens',
  'dog groomer astoria queens',
  'dog groomer forest hills queens',
  'dog groomer flushing queens',
  'dog groomer sunnyside queens',
  'dog groomer jackson heights queens',
  'dog groomer bronx',
  'dog groomer riverdale bronx',
  'dog groomer staten island',
  'dog grooming salon nyc',
  'mobile dog groomer nyc',
];

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.internationalPhoneNumber',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'places.photos',
].join(',');

async function searchText(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 20 }),
  });
  if (!res.ok) throw new Error(`${query}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.places || [];
}

function toRow(p) {
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  const photoRef = p.photos?.[0]?.name;
  const photoUrl = photoRef
    ? `https://places.googleapis.com/v1/${photoRef}/media?maxWidthPx=600&key=${GOOGLE_KEY}`
    : null;
  return {
    google_place_id: p.id ?? null,
    name: p.displayName?.text ?? null,
    salon: p.displayName?.text ?? null,
    address: p.formattedAddress ?? null,
    lat: lat ?? null,
    lng: lng ?? null,
    location: lat && lng ? `SRID=4326;POINT(${lng} ${lat})` : null,
    phone: p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    rating: p.rating ?? null,
    review_count: p.userRatingCount ?? null,
    hours: p.regularOpeningHours ? { weekday_text: p.regularOpeningHours.weekdayDescriptions } : null,
    photo_url: photoUrl ?? null,
    price_base: 75,
  };
}

async function upsertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/groomers?on_conflict=google_place_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SECRET,
      'Authorization': `Bearer ${SUPABASE_SECRET}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase insert failed: ${res.status} ${await res.text()}`);
}

(async () => {
  const byId = new Map();
  for (const q of QUERIES) {
    try {
      const places = await searchText(q);
      for (const p of places) if (p.id) byId.set(p.id, p);
      console.log(`  "${q}" → ${places.length} (running unique: ${byId.size})`);
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`  "${q}" FAILED:`, e.message);
    }
  }

  const rows = [...byId.values()].map(toRow).filter(r => r.lat && r.lng);
  console.log(`\n→ Upserting ${rows.length} groomers to Supabase...`);

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    await upsertBatch(batch);
    console.log(`  ${Math.min(i + 50, rows.length)} / ${rows.length}`);
  }
  console.log('\nDone.');
})();
