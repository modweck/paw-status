# PawStatus Handoff

Last updated: 2026-05-19

This is the next-dev pickup note for turning PawStatus from prototype into a production-quality app.

## Latest Restart Note: 2026-05-19 Guest Booking Implemented Locally

Signed-out guest booking is now implemented locally through server-side Netlify functions. Anonymous users still do not write directly to `customers`, `dogs`, `appointments`, or `appointment_requests` from the browser.

What changed:

- Added `/api/guest-booking` backed by `netlify/functions/guest-booking.js` and `server/guestBooking.js`. It validates the booking packet, uses the server-only Supabase secret/service key, creates a guest `customers` row with `auth_user_id = null`, creates the linked `dogs` row, and creates an `appointment_requests` row. It does not create confirmed `appointments`.
- Added `/api/guest-booking-claim` backed by `netlify/functions/guest-booking-claim.js`. It requires a Supabase access token, verifies that the signed-in email matches the guest booking email, then links or moves the guest rows onto the verified customer account.
- Added and pushed `supabase/migrations/20260519213308_add_guest_booking_claims.sql` with hashed guest-claim token metadata on `appointment_requests`.
- Replaced the signed-out booking gate with a guest booking form plus compact sign-in. The groomer card CTA now says `Book as guest` for signed-out users.
- Added location autosuggest with real geocoding suggestions while users type. Selecting a suggestion uses its coordinates directly instead of geocoding the same text again.
- Added dog size categories beside service selection in the search form, signed-in booking form, and guest booking form.
- Replaced vague preferred-time buckets with request timing fields: first available, preferred date, backup date, and morning/afternoon/evening.

Current implementation notes:

- The guest claim token is stored in `localStorage` only after a guest request succeeds, under `paw-status:pending-guest-claim`. After the user signs in, `CustomerApp` tries to claim the booking with the session access token and removes the token after success.
- Server-side guest booking requires `SUPABASE_URL` plus `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in Netlify/local env.
- Guest account save currently sends a magic link to the same email used in the guest booking.

Suggested next implementation slice:

- Test the guest booking function against the linked project with real env values.
- Add clearer customer-facing status copy that distinguishes request sent, external handoff, and confirmed booking.
- Add a visible post-sign-in claim success/error message instead of silently claiming in the background.
- Decide whether guest dog rows should merge into an existing dog profile or remain as a new dog under the signed-in customer.

Latest local runtime before this pass: `http://localhost:5176/` returned HTTP 200 on 2026-05-19. If no dev server is running, use `npm run dev -- --port 5176 --strictPort` or another free port.

## Previous Restart Note: 2026-05-19 E2E QA Punch List

What was reported after end-to-end testing:

- [ ] Brand/app copy observed as `ShinyPawz`; confirm whether PawStatus should be renamed everywhere or whether this was just test data.
- [x] Default location now starts empty. The old `515 E 72nd St, New York` fallback is no longer inserted after denied/unavailable browser location.
- [x] Browser location refresh now reverse-geocodes the coordinates into a visible location label when permission succeeds.
- [x] Address/ZIP search now geocodes the entry, updates the visible location field to the resolved label, and fetches groomers from those coordinates.
- [x] Starting a request from a groomer card now keeps that groomer selected through the signed-out sign-in gate.
- [x] The create customer profile form still disappears after a profile is created or after an existing signed-in profile loads; focused tests cover the ready state.
- [x] `/dogs`, `/bookings`, and `/account` are now route-backed customer sections instead of hash-only anchors.
- [x] Booking requests now append selected dog profile details to `customer_notes`: dog name, size, breed, temperament, and dog notes.
- [x] Radius options now adjust by coordinates: NYC uses `0.5 mi`, `1 mi`, `3 mi`, `5 mi`; outside NYC uses `1 mi`, `3 mi`, `5 mi`, `10 mi`.
- [x] Signed-in customer flow renders the customer/account panels instead of the magic-link sign-in card.
- [x] Signed-in users can optionally save a username and set a password. Magic links remain available, and password sign-in uses the same Supabase Auth email/user.

Implementation notes:

- Changed `src/customer/CustomerApp.jsx`, `src/layout/AppShell.jsx`, `src/App.jsx`, `src/customer/GroomerCard.jsx`, `src/customer/BookingRequestPanel.jsx`, `src/customer/CustomerOwnershipPanel.jsx`, `src/auth/AuthProvider.jsx`, `src/auth/LoginPanel.jsx`, `src/api/customers.js`, and `src/api/geocoding.js`.
- Added and pushed `supabase/migrations/20260519180621_add_customer_username.sql`; remote verification confirmed `public.customers.username` exists.
- Added and pushed `supabase/migrations/20260519182415_fix_appointment_request_policy_recursion.sql`; remote verification confirmed an authenticated-role `appointment_requests` query no longer errors with RLS recursion.
- Supabase Auth password support follows current Supabase JS docs: signed-in users call `supabase.auth.updateUser({ password })`; password sign-in calls `supabase.auth.signInWithPassword({ email, password })`.

## Current Restart Point

Customer ownership, dog profile ownership, booking request creation, and the first groomer account/request-handling slice are done in the React app. The customer app verifies the signed-in Supabase user with `supabase.auth.getUser()`, loads or creates that user's `customers.auth_user_id` row, loads/creates `dogs` rows through the owned `customers.id`, and creates `appointment_requests` from owned dog profiles.

The `/groomer` route is now open as a groomer onboarding entry point. Signed-out groomers see magic-link sign-in even when `ENABLE_GROOMER_DASHBOARD=false`; signed-in groomers can create a `groomer_accounts` row and request a pending `groomer_memberships` claim. The request-handling workspace is still feature-gated behind `ENABLE_GROOMER_DASHBOARD=true` and still requires a verified membership before a groomer can handle `appointment_requests`.

Confirmed appointment creation is still not implemented. `appointment_requests` capture customer intent, groomer review states, and optional external booking-channel handoff; `appointments` should remain reserved for real confirmed bookings once verified groomer operations or integrations can actually confirm slots.

The customer surface now has bottom-nav routes for Explore, My Dog, Bookings, Account, and Groomer. My Dog captures richer dog profile details, preferred service, preferred groomer, last groomed date, and usual grooming cadence, then renders grooming tracker cards such as `<dog name> Needs Grooming Soon`. Service selectors are grouped into titled sections from `src/data/services.js` so the catalog is easier to scan. Booking requests auto-select the saved dog preference when the groomer is in the current result set, narrow service choices to the selected groomer's advertised services when that data exists, and append the selected dog's size/breed/temperament/notes into the request notes. The waitlist/cancellation card is display-only for now. Favorite groomer tracking outside the dog profile is still local browser state until a real account-level favorite table is added.

Customer auth defaults to magic links, but signed-in customers can now optionally add `customers.username` and set a Supabase Auth password from Account. Password sign-in uses the same auth user/email; magic links remain available.

Local inspection before this pass: the app was reachable on `http://localhost:5176/` with `npm run dev -- --port 5176 --strictPort`. If that server is not running in a future session, use the same command or pick another free port with `--strictPort`.

The latest pushed Supabase migration is `20260519213308_add_guest_booking_claims.sql`. Live verification confirmed `guest_claim_token_hash`, `guest_claim_expires_at`, and `guest_claimed_at` exist on `public.appointment_requests`. The remaining database work from `supabase db advisors --linked` is cleanup/hardening, not a blocker for the current customer feature.

## Deferred Manual Action

- User will rotate the Google Places API key later. The key was not intentionally shipped in frontend code, but older seeded `groomers.photo_url` rows contained Google media URLs with the key in the query string. Those rows were cleared from the linked Supabase project on 2026-05-16, and the current app now proxies Google photos server-side through `/api/groomer-photo`.
- After rotation, update `.env` locally and the Netlify `GOOGLE_PLACES_API_KEY` environment variable. Keep the key server-only, restrict it to the required Places APIs, and set usage quotas or budget alerts.

## Latest Session Summary

What changed in the latest pass:

- Fixed bottom-nav customer options so My Dog, Bookings, and Account navigate in-app without reloading through the root page. `App` now owns route state and `AppShell` intercepts internal nav clicks.
- Fixed the `Use password instead` CTA styling by giving the secondary login button higher-specificity hover/active rules, keeping the text readable in pressed state.
- Fixed the `infinite recursion detected in policy for relation "appointment_requests"` Supabase error. The recursion came from customer/dog RLS policies querying `appointment_requests` while `appointment_requests` queries joined customer/dog rows. The fix uses private `app_private` security-definer helper functions for those cross-table checks.
- Completed the 2026-05-19 customer E2E QA slice: empty default location, resolved browser/ZIP location labels, market-specific radius options, route-backed `/dogs`/`/bookings`/`/account`, signed-out request selection through sign-in, dog details appended to booking notes, and optional username/password sign-in.
- Added and pushed `supabase/migrations/20260519180621_add_customer_username.sql`; `supabase migration list --linked` shows local and remote both include it, and a live column query confirmed `public.customers.username`.
- Added and pushed `supabase/migrations/20260519182415_fix_appointment_request_policy_recursion.sql`; `supabase migration list --linked` shows local and remote both include it, and a live authenticated-role probe now returns normally.
- Grouped all customer-facing service dropdowns into titled sections: Grooming packages, Maintenance, and Special care.
- Opened `/groomer` as the groomer onboarding entry point while keeping request handling gated behind `ENABLE_GROOMER_DASHBOARD`.
- Added onboarding-only groomer workspace loading so signed-in groomers can create an account or request a claim without querying request-handling tables while the dashboard flag is off.
- Added the groomer-owned request handling slice behind `ENABLE_GROOMER_DASHBOARD`.
- Added `src/api/groomerAccounts.js` with verified-user groomer account creation, membership loading, public groomer-profile search for claims, pending claim requests, owned request loading, booking-channel loading, calendar-connection loading, and constrained request status updates.
- Replaced the old `/groomer` shell with an authenticated groomer workspace. Signed-out users see magic-link sign-in, signed-in users without a groomer account can create one, accounts without verified memberships can request a profile claim, and verified memberships can view/update owned `appointment_requests`.
- Added booking-channel and calendar-connection metadata display. OAuth/token sync is still not implemented and should stay server-side later.
- Added and pushed `supabase/migrations/20260517040729_add_groomer_account_request_handling.sql` to the linked Supabase project.
- Added and pushed `supabase/migrations/20260517042155_restrict_appointment_request_update_columns.sql` after live verification showed `authenticated` still had broad `appointment_requests` UPDATE grants from earlier/default privileges.
- Added RLS for `groomer_accounts`, `groomer_memberships`, `booking_channels`, `calendar_connections`, groomer-owned `appointment_requests` reads/updates, and groomer read access to the customer/dog booking packet for owned requests.
- Expanded `appointment_requests.status` to include `viewed` and `needs_customer_action`; groomer browser updates are limited to `viewed`, `declined`, `needs_customer_action`, and `external_handoff`.
- Added authenticated dog profile ownership. Signed-in customers can now load dog profiles for their verified customer row and create dog rows tied to that owned `customers.id`.
- Added and pushed `supabase/migrations/20260518000809_add_dog_preferences.sql`, so dog profiles can store `preferred_service_id`, `preferred_groomer_id`, and a `preferred_groomer_name` display snapshot.
- Added and pushed the service-matching migrations (`20260517215926_add_customer_dog_service_matching.sql` and `20260517223554_backfill_default_groomer_services.sql`) so selected services filter nearby groomers by `groomers.services`.
- Added booking request creation as the pre-onboarding booking path. Signed-in customers can pick an owned dog, groomer, service, preferred windows, and notes; the app writes `appointment_requests`, not confirmed `appointments`.
- Added and pushed `supabase/migrations/20260517031448_add_appointment_requests.sql` to the linked Supabase project.
- Added authenticated customer ownership in the React app. Signed-in users now trigger `supabase.auth.getUser()`, load their `customers.auth_user_id` row, or create that row before any dog or appointment work.
- Added server-side Google Places groomer thumbnails through `/api/groomer-photo`, with a Vite dev middleware and Netlify function so the Google key stays out of the browser bundle.
- Replaced fake initial sample groomer cards with browser-location-based public groomer search capped to 5 visible groomers on first load. If the user denies location or the browser cannot provide it, the location field now stays empty until the user enters an address or ZIP code.
- Updated the public groomer mapper and card UI to prefer owned `photo_url` assets, then fall back to on-demand Google Places photos with visible attribution.
- Added a Supabase migration for `nearby_groomers` to return `google_place_id` and `website`, and stopped the seed script from storing Google media URLs with API keys.
- Converted the shipped app from static prototype HTML to a Vite + React app.
- Moved the old static customer and groomer dashboard files into `legacy/` as reference-only material.
- Added a real source layout under `src/` with separated config, Supabase client, auth, public groomer API mapping, customer UI, groomer gate, app shell, styles, and tests.
- Kept public groomer discovery as the safe public surface.
- Stopped shipping the old browser-side customer/dog/appointment writes as the live app path.
- Replaced the old public groomer operations dashboard with a gated `/groomer` shell.
- Kept `db/02_relax_rls_prototype.sql` guarded so it refuses to reopen public customer/dog/appointment writes.
- Updated Netlify to build `dist/` with `npm run build`.
- Current verification: `npm test`, `npm run build`, `node --check` for SMS, notification, groomer-photo, guest-booking, guest-booking-claim, `server/guestBooking.js`, and `scripts/seed-groomers.js`; `git diff --check`; local `/`, `/bookings`, and `/groomer` HTTP 200; mobile Chrome screenshots for `/` and `/bookings`; `supabase db push --linked --dry-run`; `supabase db push --linked`; `supabase migration list --linked`; and live column verification for the guest-claim fields on `appointment_requests`.

Next move:

- Clean up Supabase advisor findings: pin `nearby_groomers` function `search_path`, rewrite RLS policies that call `auth.uid()` directly as `(select auth.uid())`, and decide whether to move or lock down public PostGIS extension objects such as `spatial_ref_sys` / exposed PostGIS RPC helpers.
- Live-test the new Netlify guest booking functions with real env values.
- Rotate the Google Places API key when ready and update local plus Netlify env.
- Deploy the React/Netlify changes so `/api/groomer-photo` exists outside local Vite dev.
- Build the verification/admin path for pending `groomer_memberships` claims so a real person can mark a groomer claim `verified` or `rejected`.
- Seed or curate `booking_channels` for verified groomers where a real booking URL, phone, or email handoff is known.
- Keep confirmed `appointments` closed until verified groomer operations or booking integrations exist.
- Keep `ENABLE_GROOMER_DASHBOARD=false` in production until at least one verified membership/admin review process exists.

## Current State

- The live frontend is now a Vite + React source app under `src/`.
- The old static customer and groomer files are preserved under `legacy/` as migration references only.
- Netlify builds with `npm run build` and publishes `dist/`.
- Vite exposes only selected public env values from `vite.config.js`.
- `/groomer` is open for groomer sign-in, account creation, and pending public groomer-profile claim requests. `ENABLE_GROOMER_DASHBOARD=true` gates the request-handling workspace, and verified memberships are still required before request data is visible.
- Live Supabase hardening was applied on 2026-05-06.
- Anonymous users can still read public groomer search data.
- Anonymous users can no longer read or write `customers`, `dogs`, or `appointments`.
- Guest booking is implemented through server-side Netlify functions rather than reopening anonymous direct table writes.
- Signed-in users can load or create their own `customers` row by verified Supabase auth user id.
- Signed-in users can optionally save `customers.username` and set a Supabase Auth password while keeping magic-link sign-in available.
- Signed-in users can load and create dog profiles tied to their owned customer row, including preferred service and preferred groomer fields.
- Signed-in users can create `appointment_requests` tied to their owned customer and dog rows.
- Signed-in groomers can create their own `groomer_accounts` row.
- Signed-in groomers can request pending `groomer_memberships` claims for public `groomers` rows.
- Verified groomer memberships can read owned `appointment_requests`, customer/dog booking packet fields for those requests, booking-channel metadata, and calendar-connection metadata.
- Verified groomer memberships can update owned request status only to `viewed`, `declined`, `needs_customer_action`, or `external_handoff`.
- `db/02_relax_rls_prototype.sql` has a hard failing guard before the old public `ALL` policies.
- Google Places photos are proxied on demand; only owned/curated images should be stored permanently in `groomers.photo_url`.
- Initial customer results ask for browser location permission, then load up to 5 real seeded groomers near the user. Coordinates are used client-side for the public `nearby_groomers` RPC and are not persisted by the app. Denial/unavailable location leaves the location input empty until the user searches an address or ZIP code.
- Existing key-bearing Google media URLs in `groomers.photo_url` were nulled in the linked Supabase project on 2026-05-16.
- `.env` is local-only and must never be committed.

## Start Here

Read these before implementing:

- `README.md`
- `docs/LIVE_SUPABASE_AUDIT.md`
- `docs/SUPABASE_MAGIC_LINK_NOTES.md`
- `docs/REBUILD_DECISIONS.md`
- `docs/POLISH_REWORK_TASKS.md`
- `docs/PRO_LEVEL_ROADMAP.md`

Do not use `db/02_relax_rls_prototype.sql` as a production path. It is retained only as prototype history and warning material, and it now fails by default if run.

## Immediate Next Goal

Continue the modular React migration from the new source baseline.

Target outcome:

- Logged-out users can browse public groomer listings.
- Logged-out users can submit guest booking requests only through a validated server-side function.
- Logged-in customers can create their own customer row.
- Logged-in customers can add/manage their own dogs.
- Logged-in customers can create booking requests for owned dogs.
- Logged-in customers cannot create confirmed appointments yet.
- Signed-in groomers can create a groomer account and request a pending profile claim.
- Verified groomer memberships can handle owned appointment requests without creating confirmed appointments.
- Production still needs a membership verification/admin path before groomer request handling should be broadly enabled.

## Next Task List

- [x] Replace the live static HTML app with a Vite + React app under `src/`.
- [x] Move old static app files to `legacy/`.
- [x] Add modular config, Supabase client, auth, groomer API, customer UI, and groomer gate modules.
- [x] Add focused unit tests for public config, magic-link redirect URLs, and groomer row mapping.
- [x] Gate `/groomer` until groomer auth and salon ownership exist.
- [x] Reopen `/groomer` for groomer onboarding while keeping request handling feature-gated.
- [x] Add a hard failing guard to `db/02_relax_rls_prototype.sql`.
- [x] Add server-side Google Places thumbnail resolution without exposing the Google API key.
- [x] Update `nearby_groomers` to return `google_place_id` for thumbnail lookup.
- [x] Clear legacy Google media URLs from `groomers.photo_url` in the linked Supabase project.
- [x] Replace initial sample groomer cards with permission-based real nearby groomer loading.
- [ ] Rotate the Google Places API key and update `.env` plus Netlify environment variables.
- [ ] Deploy the Netlify function and frontend changes.
- [ ] Later product idea: sell clearly labeled sponsored/featured result positions to groomers.
- [ ] Confirm Supabase Auth email provider is enabled in the dashboard.
- [ ] Configure Supabase Auth Site URL and redirect URLs.
- [ ] Configure custom SMTP for real delivery before production use.
- [x] On first authenticated load, call `supabase.auth.getUser()`.
- [x] Look up `customers` by `auth_user_id`.
- [x] Create the customer row if it does not exist.
- [x] Add dog profile creation under the authenticated customer row.
- [x] Add booking request creation under authenticated customer/dog ownership.
- [x] Add groomer account creation under the authenticated groomer user.
- [x] Add pending groomer profile claim requests through `groomer_memberships`.
- [x] Add verified-membership request handling for `appointment_requests`.
- [x] Restore customer My Dog and Account destinations in the bottom nav.
- [x] Add richer dog profile fields and grooming-cadence tracker UI.
- [x] Add dog-level preferred service and preferred groomer fields for booking auto-fill.
- [x] Add route-backed My Dog, Bookings, and Account destinations.
- [x] Keep default location empty until browser permission or user-entered address/ZIP.
- [x] Add market-specific radius options for NYC versus outside NYC.
- [x] Add optional username/password account setup while keeping magic-link sign-in.
- [x] Add display-only cancellation waitlist card.
- [x] Add a local favorite/Your Groomer card and rebook shortcut.
- [x] Expand the visible service catalog beyond the original three options.
- [x] Group service dropdown options into titled sections.
- [x] Push the service-matching migration so selected services strictly filter groomers by `groomers.services`.
- [x] Push the dog preference migration.
- [x] Add signed-out guest booking requests through a server-side Netlify function without reopening anonymous table writes.
- [x] Add post-submit account save/linking so a guest booking can later attach to the verified email's Supabase Auth user.
- [ ] Clean up Supabase advisor findings for `nearby_groomers`, RLS policy performance, and PostGIS/public-schema exposure.
- [ ] Add confirmed appointment creation only after groomer ownership or integrations exist.
- [ ] Add an admin/review path to verify or reject pending groomer membership claims.

## Supabase State To Preserve

Live project:

```text
Project ref: faizrqajtdttcklflcbz
URL: https://faizrqajtdttcklflcbz.supabase.co
Dashboard: https://supabase.com/dashboard/project/faizrqajtdttcklflcbz
```

Applied migrations:

- `supabase/migrations/20260506023427_baseline_prototype_schema.sql`
- `supabase/migrations/20260506202626_restore_auth_gated_rls.sql`
- `supabase/migrations/20260516235858_expose_groomer_place_photo_fields.sql`
- `supabase/migrations/20260517031448_add_appointment_requests.sql`
- `supabase/migrations/20260517040729_add_groomer_account_request_handling.sql`
- `supabase/migrations/20260517042155_restrict_appointment_request_update_columns.sql`
- `supabase/migrations/20260517215926_add_customer_dog_service_matching.sql`
- `supabase/migrations/20260517223554_backfill_default_groomer_services.sql`
- `supabase/migrations/20260518000809_add_dog_preferences.sql`
- `supabase/migrations/20260519180621_add_customer_username.sql`
- `supabase/migrations/20260519182415_fix_appointment_request_policy_recursion.sql`
- `supabase/migrations/20260519213308_add_guest_booking_claims.sql`

Current intended RLS behavior:

- `groomers`: public `SELECT`
- `customers`: authenticated user can insert/select/update own row
- `dogs`: authenticated customer can manage own dogs
- `appointment_requests`: authenticated customer can create/read own requests through owned dogs
- `groomer_accounts`: authenticated groomer can create/select/update own account row
- `groomer_memberships`: authenticated groomer can select own account memberships and request pending claims only
- `booking_channels`: verified groomer memberships can select own groomer handoff metadata
- `calendar_connections`: groomer accounts can select own calendar metadata
- `appointment_requests`: verified groomer memberships can select owned requests and update only allowed handoff/review statuses
- `appointments`: authenticated customer can create/read/update appointments through owned dogs

Do not reintroduce public `ALL` policies on `customers`, `dogs`, or `appointments`.

## Implementation Notes

- Keep Vite + React as the live app path.
- Keep `legacy/customer-prototype.html` and `legacy/groomer-dashboard-prototype.html` as references only.
- Do not move the Supabase secret key into frontend code.
- Do not trust `localStorage` as identity.
- Do not build dynamic HTML from unescaped Supabase, Google Places, or user-entered values.
- Keep Netlify for now unless deployment requirements change.

Current source map:

```text
src/
  api/          public groomer data, customer/dog/request ownership APIs, guest booking calls, and external API adapters
  auth/         Supabase session and magic-link UI
  config/       selected public app config and flags
  customer/     customer discovery UI
  data/         static service metadata
  groomer/      feature-flagged groomer account and request dashboard
  layout/       app shell/navigation
  styles/       app CSS
```

## Verification Checklist

Run these lightweight checks after edits:

```bash
npm test
npm run build
node --check netlify/functions/send-sms.js
node --check netlify/functions/send-notification.js
node --check netlify/functions/groomer-photo.js
node --check netlify/functions/guest-booking.js
node --check netlify/functions/guest-booking-claim.js
node --check server/guestBooking.js
node --check scripts/seed-groomers.js
git diff --check
```

After auth/booking work, also verify with the publishable key:

- [ ] Anonymous customer read returns zero rows.
- [ ] Anonymous groomer read still returns public groomers.
- [ ] Authenticated customer can read only their own row.
- [x] Dog ownership code creates dogs attached to the authenticated customer's row.
- [x] Booking request code creates requests attached to the authenticated customer's owned dog.
- [ ] Authenticated customer can create a confirmed appointment for their own dog once that flow exists.
- [ ] Authenticated customer cannot read another customer's dog or appointment rows.

## Known Open Questions

- [ ] Which production domain should be used for Supabase Auth Site URL?
- [ ] Which SMTP provider should be used? Current recommendation is Resend.
- [ ] Should OneSignal stay, or should first production release be SMS-only?
- [ ] What is the admin process for verifying or rejecting pending groomer membership claims?
- [ ] Should `nearby_groomers` expose groomer phone numbers publicly?
- [ ] Should PostGIS RPC functions remain exposed through the public REST API?
