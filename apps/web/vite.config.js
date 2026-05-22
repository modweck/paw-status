import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchGooglePlacePhoto, toPublicPhotoError } from './server/googlePlacesPhoto.js';
import {
  handleGuestBookingClaimEvent,
  handleGuestBookingEvent,
} from './server/guestBooking.js';

const webRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(webRoot, '../..');

function loadAppEnv(mode) {
  return {
    ...loadEnv(mode, repoRoot, ''),
    ...loadEnv(mode, webRoot, ''),
  };
}

function publicAppConfig(mode) {
  const env = loadAppEnv(mode);

  return {
    SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL || '',
    SUPABASE_PUBLISHABLE_KEY:
      env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
    ENABLE_GROOMER_DASHBOARD:
      env.ENABLE_GROOMER_DASHBOARD === 'true' ||
      env.VITE_ENABLE_GROOMER_DASHBOARD === 'true',
  };
}

function groomerPhotoDevPlugin(env) {
  return {
    name: 'paw-status-groomer-photo-dev',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith('/api/groomer-photo')) {
          next();
          return;
        }

        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Content-Type', 'application/json');

        if (request.method !== 'GET') {
          response.statusCode = 405;
          response.end(JSON.stringify({ error: 'Method Not Allowed' }));
          return;
        }

        const requestUrl = new URL(request.url, 'http://localhost');

        try {
          const result = await fetchGooglePlacePhoto({
            apiKey: env.GOOGLE_PLACES_API_KEY,
            maxWidth: requestUrl.searchParams.get('maxWidth'),
            placeId: requestUrl.searchParams.get('placeId'),
          });

          response.statusCode = 200;
          response.end(JSON.stringify(result));
        } catch (error) {
          const publicError = toPublicPhotoError(error);
          response.statusCode = publicError.statusCode;
          response.end(JSON.stringify(publicError.body));
        }
      });
    },
  };
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function guestBookingDevPlugin(env) {
  return {
    name: 'paw-status-guest-booking-dev',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const isGuestBooking = request.url === '/api/guest-booking';
        const isGuestClaim = request.url === '/api/guest-booking-claim';
        if (!isGuestBooking && !isGuestClaim) {
          next();
          return;
        }

        const event = {
          body: await readRequestBody(request),
          headers: request.headers,
          httpMethod: request.method,
        };
        const result = isGuestBooking
          ? await handleGuestBookingEvent(event, env)
          : await handleGuestBookingClaimEvent(event, env);

        response.statusCode = result.statusCode;
        Object.entries(result.headers || {}).forEach(([key, value]) => {
          response.setHeader(key, value);
        });
        response.end(result.body);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadAppEnv(mode);

  return {
    plugins: [react(), groomerPhotoDevPlugin(env), guestBookingDevPlugin(env)],
    define: {
      __APP_CONFIG__: JSON.stringify(publicAppConfig(mode)),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.js',
      define: {
        __APP_CONFIG__: JSON.stringify({}),
      },
    },
  };
});
