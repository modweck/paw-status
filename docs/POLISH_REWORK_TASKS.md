# PawStatus Polish and Rework Task List

This repo is a working prototype for a dog groomer booking app with customer search, booking, SMS/live status updates, and a groomer dashboard. Before visual polish, the main work is to make the app safer, more maintainable, and less demo-dependent.

## Priority 0: Lock Down Data and Access

- [x] Remove or quarantine `db/02_relax_rls_prototype.sql` so public read/write policies are not treated as a production path.
- [x] Replace the live static HTML app with a Vite + React app that exposes only selected public env values.
- [x] Stop `PawAuth.requireAuth()` from resolving fake guest customer/dog rows.
- [x] Gate groomer request handling unless `ENABLE_GROOMER_DASHBOARD=true` is explicitly set, while still allowing `/groomer` onboarding.
- [x] Decide the real auth model for customers: Supabase Auth, magic link, OTP, or another flow.
- [x] Wire customers to `customers.auth_user_id` so the policies in `db/schema.sql` can actually work.
- [x] Replace the current localStorage-only `PawAuth.requireAuth()` bypass in `index.html` with a real sign-in/session flow shell.
- [x] Add authenticated dog profile creation through the owned customer row.
- [x] Add authenticated booking request creation through the owned dog row.
- [x] Add optional username/password setup for signed-in customers while keeping magic-link auth.
- [x] Add signed-out guest booking requests through a validated server-side function, then offer optional account save/linking after submission.
- [x] Add groomer authentication before `/groomer` is usable outside a private demo.
- [x] Add groomer account/membership ownership to the schema so one verified groomer membership can only see and update its own appointment requests.
- [x] Add RLS policies for groomer dashboard appointment request reads and allowed status updates.
- [ ] Add an admin/review path for approving or rejecting pending groomer membership claims.
- [ ] Verify that customer appointment reads only return appointments belonging to the signed-in customer.
- [ ] Verify that customer appointment writes only allow the signed-in customer to book or modify their own dog's appointments.
- [ ] Move sensitive status updates behind a server-side function if RLS alone is not enough for the groomer workflow.

## Priority 1: Stop Public Mutation and Data Exposure

- [x] Remove live browser-side customer/dog/appointment writes from the shipped app path by moving static prototypes to `legacy/`.
- [x] Remove live browser-side groomer status writes from the shipped app path by gating request handling.
- [ ] Decide which writes can safely stay client-side under RLS and which need Netlify functions.
- [x] Keep guest booking out of direct browser table writes; route it through a Netlify function with server-side validation and record creation.
- [x] Protect groomer request handling in the shipped app behind auth, verified membership, and the dashboard feature flag instead of exposing the legacy dashboard.
- [x] Stop exposing customer phone numbers to a public dashboard.
- [x] Validate groomer request status transitions with database constraints/RLS so users cannot jump requests to arbitrary states.
- [ ] Add request validation to `netlify/functions/send-sms.js`.
- [ ] Add request validation, invalid JSON handling, missing env checks, and non-2xx upstream handling to `netlify/functions/send-notification.js`.
- [ ] Replace the placeholder `https://yourapp.com/booking/...` URL in `send-notification.js`.
- [ ] Decide whether OneSignal is still part of the product or remove the unused function.

## Priority 2: Fix XSS and Unsafe HTML Rendering

- [ ] Replace dynamic `innerHTML` rendering for groomer cards in `index.html` with DOM construction or escaping helpers.
- [ ] Replace dynamic `innerHTML` rendering for groomer dashboard appointment cards with DOM construction or escaping helpers.
- [ ] Escape all values coming from Supabase, Google Places, user profile fields, dog names, notes, and appointment data.
- [ ] Review inline `onclick` strings that interpolate names or IDs.
- [ ] Add a small `escapeHtml` utility if staying with vanilla HTML/JS.
- [ ] Add tests or smoke checks for names containing quotes, angle brackets, and ampersands.

## Priority 3: Split the Frontend Into Maintainable Pieces

- [x] Choose a basic build structure: Vite vanilla modules or Vite/React.
- [x] Add `package.json` with scripts for `dev`, `build`, and `test`.
- [x] Split the shipped app path out of the 5,584-line `index.html` and preserve the old file under `legacy/`.
- [x] Move Supabase constants and API calls into an API module.
- [x] Move auth/customer ownership logic into its own module.
- [x] Move dog profile logic into its own module.
- [x] Move groomer search and nearby groomer mapping into its own module.
- [x] Move booking request creation into its own module.
- [ ] Move booking calendar and confirmed appointment creation into its own module.
- [ ] Move live tracker/status syncing into its own module.
- [ ] Move waitlist UI into its own module or remove it until backed by data.
- [ ] Move chat/demo reply UI into its own module or remove it until backed by product requirements.
- [x] Extract shared CSS variables and reusable layout styles for the shipped app path.
- [x] Remove large inline styles from generated markup in the shipped app path.

## Priority 4: Remove Demo Residue From Live Paths

- [ ] Remove or hide the `Simulate live groom` button behind an explicit demo flag.
- [ ] Remove the comment and behavior that says sign-in is disabled for demo.
- [ ] Remove hardcoded "Your Groomer" and "Jill" assumptions unless they are real product behavior.
- [ ] Replace stale hardcoded availability like "Mar 25" with real or clearly mocked dates.
- [x] Replace fallback groomer cards with browser-location-based real seeded groomer results, leaving location empty when permission is denied or unavailable.
- [ ] Remove the tracked `index` prototype file if it is no longer used.
- [ ] Make all demo-only data and behavior easy to identify from a single config flag.

## Priority 5: Database and Data Model Cleanup

- [ ] Convert the schema into real migrations instead of "paste this whole file into Supabase SQL Editor".
- [ ] Add a proper migration for `customers_phone_unique` instead of hiding it inside the prototype RLS relaxation file.
- [x] Add groomer account and membership tables if the dashboard is intended for multiple salons.
- [x] Add guest-claim metadata if needed so verified signed-in users can link prior guest booking rows to their account safely.
- [ ] Pin `nearby_groomers` to an explicit Postgres `search_path` so the public RPC is harder to misuse.
- [ ] Rewrite RLS policies that call `auth.uid()` directly to use `(select auth.uid())` where appropriate, reducing per-row policy overhead.
- [ ] Decide whether to move PostGIS out of `public` or lock down exposed PostGIS helper tables/functions reported by Supabase advisors.
- [x] Fix recursive groomer/customer/dog `appointment_requests` policies by moving cross-table ownership checks into private helper functions.
- [ ] Re-run `supabase db advisors --linked` after the cleanup migration and record remaining accepted warnings.
- [ ] Add appointment status transition rules or constraints if needed.
- [ ] Review indexes after the real query patterns are set.
- [ ] Decide whether `nearby_groomers` should expose phone numbers publicly.
- [ ] Add seed script setup docs and an `.env.example`.
- [ ] Make `scripts/seed-groomers.js` handle missing `.env` more gracefully.
- [ ] Decide whether Google Places photo URLs with embedded API keys should be persisted or proxied.

## Priority 6: Product Flow and UX Polish

- [ ] Define the intended first-time customer flow: search first, sign in first, or sign in at booking.
- [x] Let signed-out customers submit a full booking request packet, then offer to save the customer/dog info as an account for next time.
- [x] Replace vague guest/signed-in preferred-time buckets with request timing fields: first available, preferred date, backup date, and morning/afternoon/evening.
- [x] Organize visible service dropdown options into titled sections.
- [x] Route My Dog, Bookings, and Account from the bottom nav instead of hash-only anchors.
- [x] Keep My Dog, Bookings, and Account navigation inside the React app instead of full-page reloads.
- [x] Keep selected groomer context when a signed-out user starts a request and then signs in.
- [x] Add NYC versus outside-NYC radius choices.
- [x] Append selected dog size, breed, temperament, and dog notes into booking request notes.
- [ ] Make booking failure visible to the user instead of silently continuing when appointment insert fails.
- [ ] Prevent SMS send attempts when there is no valid customer phone number.
- [ ] Add proper empty, loading, error, and retry states for nearby groomer search.
- [ ] Add proper empty, loading, error, and retry states for bookings.
- [ ] Fix the mobile bottom nav overlap/crowding seen in the home screenshot.
- [ ] Fix groomer dashboard header/date badge clipping on narrow mobile widths.
- [ ] Decide whether waitlist is a real feature; if yes, add persistence and dashboard visibility.
- [ ] Decide whether chat is a real feature; if yes, replace canned replies with a scoped implementation.
- [ ] Align customer app and groomer dashboard visual language once the core flows are stable.

## Booking Model To Address

The current app should not claim that an appointment is booked unless PawStatus or a trusted integration can actually confirm a slot. The ideal user booking flow is:

1. Customer searches by location, radius, and service.
2. Customer enters dog/customer details and requested timing: first available, preferred date, backup date, and morning/afternoon/evening.
3. PawStatus creates an `appointment_requests` packet, not a confirmed `appointments` row.
4. If the groomer has a real booking URL, Google/Square/Calendly/Acuity link, or website widget, PawStatus sends the customer there and marks the request as an external handoff.
5. The request becomes confirmed only when one of these is true: the groomer confirms it, PawStatus controls that groomer's availability, or an authenticated provider integration/webhook confirms the booking.
6. Later, real booking should use actual dates, available slots, service duration, travel/service area rules, buffer times, conflict checks, and provider-specific confirmation.

Open work:

- [ ] Add customer-visible language that distinguishes `Request sent`, `Continue to groomer booking site`, and `Confirmed`.
- [ ] Add real availability/slot selection only after groomer-owned calendar data or provider integrations exist.
- [ ] Add webhook/API confirmation handling for providers such as Square, Calendly, Acuity, or Google Calendar where supported.
- [ ] Add groomer/admin confirmation flow for requests that cannot be confirmed through an API.

## Priority 7: Testing and Verification

- [ ] Add at least one browser smoke test for the customer search page.
- [ ] Add a smoke test for creating a booking.
- [ ] Add a smoke test for viewing bookings.
- [ ] Add a smoke test for groomer status updates after auth is added.
- [ ] Add tests for Netlify SMS function request validation.
- [ ] Add tests for notification function request validation if OneSignal stays.
- [ ] Add linting or formatting so future edits do not worsen the single-file sprawl.
- [ ] Add a documented local verification command list to the README.

## Priority 8: Documentation

- [ ] Rewrite `README.md` with the product goal, current prototype status, setup steps, env vars, and known risks.
- [ ] Document all required Netlify environment variables.
- [ ] Document all required Supabase setup steps.
- [ ] Document how to seed groomers.
- [ ] Document how to run the customer app locally.
- [ ] Document how to run the groomer dashboard locally.
- [ ] Document which flows are production-ready and which are demo-only.
- [ ] Add a short architecture note after the frontend split is done.

## Suggested Implementation Order

1. Document the current setup and env vars so work is reproducible.
2. Rework auth and RLS before expanding features.
3. Protect the groomer dashboard and status updates.
4. Fix unsafe rendering and remove public mutation paths.
5. Split the frontend into modules or a small app framework.
6. Remove demo residue and stale prototype files.
7. Add smoke tests and verification commands.
8. Polish the UI once the product behavior is stable.

## Current Evidence From Audit

- `db/02_relax_rls_prototype.sql` grants public read/write policies for customer, dog, and appointment data.
- `index.html` writes directly to Supabase from the browser using the publishable key.
- `groomer-dashboard.html` reads customer appointment data and patches appointment statuses from a public route.
- `index.html` bypasses real auth by resolving localStorage or guest customer/dog objects.
- Dynamic HTML is built by string interpolation in both customer and groomer views.
- `index.html` is over 5,500 lines and mixes UI, data access, auth, demo logic, and state management.
- `README.md` does not explain setup, risks, env vars, or architecture.
