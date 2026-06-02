// @vitest-environment node
//
// Guards the netlify.toml API routing. Every /api/* path the client actually
// calls must resolve to its Netlify function — not fall through to the SPA
// catch-all (which silently returns index.html and breaks the endpoint).
//
// When you add a new client endpoint + function, add it to CLIENT_ROUTES below
// and a matching [[redirects]] block. This test fails if they drift.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const tomlPath = resolve(here, '../../../netlify.toml');

// Parse ordered (from, to) redirect pairs from netlify.toml.
function loadRedirects() {
  const text = readFileSync(tomlPath, 'utf8');
  const pairs = [];
  const re = /from\s*=\s*"([^"]+)"\s*\n\s*to\s*=\s*"([^"]+)"/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    pairs.push({ from: match[1], to: match[2] });
  }
  return pairs;
}

// Mimic Netlify's first-match redirect resolution: a trailing "/*" is a prefix
// match; otherwise it's exact.
function resolvePath(redirects, path) {
  for (const { from, to } of redirects) {
    if (from.endsWith('/*')) {
      if (path === from.slice(0, -2) || path.startsWith(from.slice(0, -1))) return to;
    } else if (path === from) {
      return to;
    }
  }
  return null;
}

// The contract: client path → expected function name.
const CLIENT_ROUTES = [
  ['/api/groomer-photo', 'groomer-photo'],
  ['/api/guest-booking', 'guest-booking'],
  ['/api/guest-booking-claim', 'guest-booking-claim'],
  ['/api/availability', 'availability'],
  ['/api/groomer-business-search', 'groomer-business-search'],
  ['/api/groomer-business-link', 'groomer-business-link'],
  ['/api/places/autocomplete', 'places-autocomplete'],
  ['/api/places/details', 'places-details'],
  ['/api/admin/groomer-membership-claims', 'admin-groomer-membership-claims'],
  ['/api/admin/groomer-membership-claims/abc123/review', 'admin-groomer-membership-claim-review'],
  ['/api/admin/access-requests', 'admin-access-requests'],
  ['/api/admin/access-requests/abc123/review', 'admin-access-request-review'],
];

describe('netlify.toml API routing', () => {
  const redirects = loadRedirects();

  it.each(CLIENT_ROUTES)('routes %s to its function', (path, fn) => {
    expect(resolvePath(redirects, path)).toBe(`/.netlify/functions/${fn}`);
  });

  it('keeps the SPA catch-all last so it never shadows an API route', () => {
    const apiIndexes = redirects
      .map((redirect, index) => ({ redirect, index }))
      .filter(({ redirect }) => redirect.from.startsWith('/api/'))
      .map(({ index }) => index);
    const catchAllIndex = redirects.findIndex((redirect) => redirect.from === '/*');

    expect(catchAllIndex).toBeGreaterThan(-1);
    expect(Math.max(...apiIndexes)).toBeLessThan(catchAllIndex);
  });
});
