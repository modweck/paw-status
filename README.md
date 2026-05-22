# PawStatus

PawStatus is a prototype dog grooming booking product. The current repo contains:

- A small npm workspace monorepo with the deployable web app in `apps/web`
- A Vite + React customer app in `apps/web/src/`
- Reserved backend/shared package slots in `apps/api` and `packages/core`
- A gated groomer dashboard route rendered by the React app
- Legacy static prototypes in `legacy/`
- Netlify functions for guest booking, Google photo proxying, SMS, and push notifications
- Supabase SQL for groomers, customers, dogs, appointment requests, and appointments
- A Google Places seed script for NYC groomers

The app has a good product direction, but it is not production-ready yet. The main work is security, auth, data ownership, maintainability, and replacing demo behavior with real booking logic.

## Current Status

This is a prototype.

Known unsafe or demo-only areas:

- `db/02_relax_rls_prototype.sql` documents the old public read/write prototype policies and now fails by default if run.
- The legacy static prototypes in `legacy/` are reference material only.
- Confirmed appointment writes are intentionally not reimplemented yet; the React app stores booking intent as `appointment_requests`. Signed-in customers create requests through owned dog rows, while signed-out customers use a server-side guest booking function.
- The `/groomer` route is gated unless `ENABLE_GROOMER_DASHBOARD=true`. When enabled, it requires Supabase Auth, lets a groomer create an account, request a pending claim on a public groomer profile, and shows `appointment_requests` only for verified memberships.
- Appointment availability is partly hardcoded/demo-driven.
- Some notification code is experimental or incomplete.

Use the docs in `docs/` before extending the app:

- `docs/PRO_LEVEL_ROADMAP.md`
- `docs/POLISH_REWORK_TASKS.md`
- `docs/SUPABASE_POSTGRES_TERMS.md`

## Repo Layout

```text
apps/web/       Netlify-deployed Vite + React app and current Netlify functions
apps/api/       Reserved for the future proper backend service
packages/core/  Reserved shared domain contracts and validation helpers
supabase/       Supabase CLI config, migrations, and seed file
db/             Historical/prototype schema notes
docs/           Product, security, and handoff notes
legacy/         Static prototype references only
```

## Known Supabase Project

Set the current project values in `.env` locally and in Netlify environment
variables for deploys:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Known live project from the audit/handoff:

```text
Project ref: faizrqajtdttcklflcbz
Dashboard: https://supabase.com/dashboard/project/faizrqajtdttcklflcbz
```

The repo does not contain the Supabase account login, service role key, or database password.

## Local Usage

Install dependencies, then run the Vite app:

```bash
npm install
npm run dev
```

The app serves:

```text
/ -> customer discovery and auth shell
/dogs -> customer app scrolled to My Dog
/bookings -> customer app scrolled to booking/sign-in flow
/account -> customer app scrolled to account
/groomer -> gated groomer account and request-handling dashboard
```

The customer app asks the browser for location permission on first load. If permission is granted, groomer discovery uses the user's current coordinates without storing them and refreshes the visible location label from reverse geocoding. If permission is denied or unavailable, the location input stays empty until the user enters an address or ZIP code. As users type a location, the app loads address suggestions and uses the selected suggestion's coordinates for search.

The customer app also has bottom navigation routes for My Dog, Bookings, and Account. Signed-in users can save richer dog profile details, including breed, size, temperament notes, preferred service, preferred groomer, last groomed date, and usual grooming cadence, so booking requests can reuse the owned dog row and the UI can show grooming reminder cards. Booking requests append key dog details to the request notes so groomers see size, breed, temperament, and dog notes with the service request. Signed-out users can submit a guest booking packet through `/api/guest-booking`, then send a magic link to save/link the booking to the same verified email. Booking timing is currently request-based: first available, preferred date, backup date, and morning/afternoon/evening. It is not confirmed live scheduling yet.

Customer auth defaults to Supabase magic links. Users who are already signed in can optionally add a username and password from Account, and future sign-ins can use either the magic link or password path against the same Supabase Auth user/email.

Service filtering is driven by `apps/web/src/data/services.js` plus the `groomers.services` JSONB field. The linked Supabase project has the service-aware `nearby_groomers(service_id)` RPC applied, so customer search only returns groomers whose `services` array contains the selected service. Booking requests also narrow the service dropdown to the currently selected groomer's advertised services when that data is present.

Legacy files remain for reference only:

```text
legacy/customer-prototype.html
legacy/groomer-dashboard-prototype.html
```

Netlify runs the root `npm run build` command, which delegates to the
`@paw-status/web` workspace and publishes `apps/web/dist/`.

## Environment Variables

Copy `.env.example` to `.env` for local scripts. Configure the same values in Netlify for deployed builds and functions.

`apps/web/vite.config.js` exposes only selected public values to browser code:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
ENABLE_GROOMER_DASHBOARD
```

Leave `ENABLE_GROOMER_DASHBOARD=false` for production until pending groomer claims can be reviewed and verified. It can be enabled locally to test groomer account creation and verified-membership request handling.

Required for seeding groomers and server-side Google Places thumbnails:

```text
GOOGLE_PLACES_API_KEY
SUPABASE_URL
SUPABASE_SECRET_KEY
```

Guest booking functions also require `SUPABASE_URL` and either `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. Keep those values server-only.

Required for SMS:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_MESSAGING_SERVICE_SID
```

Or use `TWILIO_FROM_NUMBER` instead of `TWILIO_MESSAGING_SERVICE_SID`.

Optional or under review:

```text
ONESIGNAL_APP_ID
ONESIGNAL_API_KEY
PUBLIC_APP_URL
```

## Verification Commands

Current lightweight checks:

```bash
npm test
npm run build
node --check apps/web/netlify/functions/send-sms.js
node --check apps/web/netlify/functions/send-notification.js
node --check apps/web/netlify/functions/groomer-photo.js
node --check apps/web/netlify/functions/guest-booking.js
node --check apps/web/netlify/functions/guest-booking-claim.js
node --check apps/web/server/guestBooking.js
node --check scripts/seed-groomers.js
git diff --check
```

Headless screenshot checks can also be run with Chrome if installed:

```bash
google-chrome-stable --headless --disable-gpu --screenshot=/tmp/paw-status-home.png --window-size=430,932 http://localhost:5173/
google-chrome-stable --headless --disable-gpu --screenshot=/tmp/paw-status-groomer.png --window-size=430,932 http://localhost:5173/groomer
```

## Seed Groomers

The seed script reads `.env` from the repo root:

```bash
node scripts/seed-groomers.js
```

It uses Google Places to find NYC dog groomers and upserts them into the Supabase `groomers` table. It stores `google_place_id` for durable matching, but does not store Google photo media URLs in `photo_url`.

## Groomer Thumbnails

Owned or curated groomer images can be stored in `groomers.photo_url`. Google Places photos are loaded on demand through `/api/groomer-photo?placeId=...`, which keeps `GOOGLE_PLACES_API_KEY` server-side and returns a temporary photo URI plus attribution metadata. Do not copy Google Places photo bytes into Supabase Storage as permanent app assets.

This script expects a secret Supabase key. Do not put that key in public frontend code.

## Recommended Rebuild Direction

The current direction is:

1. Keep Supabase as the backend.
2. Keep Netlify unless deployment needs change.
3. Keep the live frontend in `apps/web` with Vite + React.
4. Split the product into customer, groomer, and admin surfaces.
5. Add real Supabase Auth and RLS before new product features.
6. Replace hardcoded appointment slots with real availability.

## First Milestone

Before feature work:

- [ ] Confirm access to the Supabase project.
- [ ] Decide customer auth flow.
- [ ] Decide groomer dashboard access strategy.
- [ ] Replace prototype RLS with production-safe policies.
- [ ] Add `.env` locally from `.env.example`.
- [ ] Decide whether OneSignal stays or SMS-only is enough for the first version.
- [x] Choose Vite + React or another frontend rebuild target.

## Security Rule

Never expose `SUPABASE_SECRET_KEY`, service role keys, Twilio auth tokens, Google Places keys, or OneSignal API keys in browser code.
