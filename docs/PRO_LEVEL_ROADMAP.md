# PawStatus Pro-Level Roadmap

This document describes what needs to happen to turn PawStatus from a strong prototype into a credible production product. The existing `docs/POLISH_REWORK_TASKS.md` is the detailed checklist. This roadmap is the higher-level build plan.

## Product North Star

PawStatus should become a two-sided grooming operations product:

- Customers can find a trusted groomer, book a real appointment, manage their dog profile, and track grooming status.
- Groomers can manage the day's appointments, update each dog's live status, and notify customers without exposing private data.
- Admins or salon owners can manage services, pricing, hours, staff, customers, and availability.

The product should feel like a professional mobile booking app for customers and a focused operations dashboard for groomers.

## Definition of Pro Level

- [x] Real authentication for customers and the first groomer account flow.
- [x] Real database permissions with Supabase RLS for customer, dog, request, and initial groomer ownership.
- [ ] No public route can read private customer data.
- [ ] No public client can mutate another user's appointments.
- [ ] Real appointment availability, not hardcoded slots.
- [ ] Clear separation between customer app, groomer dashboard, and admin/ops tools.
- [ ] Maintainable frontend structure instead of one giant HTML file.
- [ ] Proper loading, empty, error, and success states.
- [ ] Smoke tests for the critical flows.
- [ ] Setup, environment, and deployment docs that another engineer can follow.

## Phase 1: Stabilize The Prototype

Goal: make the current project understandable and safe to work on before a rebuild.

- [ ] Rewrite `README.md` with the current app purpose and setup notes.
- [ ] Add `.env.example` with all expected environment variables.
- [ ] Document the known Supabase project URL and publishable key.
- [ ] Document missing secrets that must come from Supabase, Netlify, Twilio, Google Places, and OneSignal if kept.
- [ ] Mark all demo-only behavior in code and docs.
- [ ] Remove or archive the unused tracked `index` prototype file.
- [ ] Decide whether OneSignal is still part of the app or remove it.
- [ ] Add a short local verification section: open customer page, open groomer page, run `node --check` on functions.

Deliverable:

- [ ] A clear repo that explains what exists, what is demo-only, and what is unsafe.

## Phase 2: Fix Security And Data Ownership

Goal: stop the biggest product risk before adding features.

- [x] Replace the prototype public RLS policies with production-safe policies.
- [x] Wire customer rows to Supabase Auth users through `customers.auth_user_id`.
- [x] Replace localStorage-only auth with a real sign-in/session flow.
- [x] Add groomer user accounts.
- [ ] Add salon or organization ownership tables.
- [x] Add a relationship between groomer accounts and public groomer profiles through memberships.
- [x] Protect `/groomer` so only signed-in groomers can use the account/request surface when the feature flag is enabled.
- [x] Ensure customers can only see and create dogs under their own customer row.
- [x] Add customer booking requests through owned dogs before confirmed calendar ownership.
- [ ] Ensure customers can only see their own appointments.
- [x] Ensure verified groomer memberships can only see appointment requests assigned to their groomer profile.
- [ ] Move status updates behind a server-side function if the policy logic is too complex for direct client updates.

Deliverable:

- [ ] The app can be deployed without exposing all customer, dog, and appointment data.

## Phase 3: Define The Real Data Model

Goal: support real booking instead of mock availability.

- [ ] Add salons or businesses.
- [ ] Add groomer staff profiles.
- [ ] Add services with duration, base price, and size/breed modifiers.
- [ ] Add salon business hours.
- [ ] Add groomer working hours.
- [ ] Add appointment buffers and blocked time.
- [ ] Add appointment status history or event log.
- [ ] Add customer notification preferences.
- [ ] Add waitlist requests if waitlist stays.
- [ ] Add customer notes and dog handling notes with clear privacy rules.

Deliverable:

- [ ] A schema that can support real search, booking, status tracking, and groomer operations.

## Phase 4: Rebuild The Frontend Structure

Goal: make the codebase maintainable enough to grow.

Recommended direction:

- Use Vite + React for a fast app rebuild, unless there is a strong reason to choose Next.js.
- Keep Supabase as the backend.
- Keep Netlify if the deployment target is already there.

Tasks:

- [ ] Add `package.json`.
- [ ] Add a real dev server.
- [ ] Add source folders under `src/`.
- [ ] Split customer app routes/views from groomer dashboard routes/views.
- [ ] Move Supabase calls into API modules.
- [ ] Move auth into a dedicated module/provider.
- [ ] Move booking state into focused hooks or services.
- [ ] Move reusable UI into components.
- [ ] Move CSS into organized app styles or component styles.
- [ ] Remove inline event handlers over time.

Suggested structure:

```text
src/
  app/
  auth/
  api/
  customer/
  groomer/
  admin/
  components/
  styles/
  utils/
```

Deliverable:

- [ ] The current app is replaced by a maintainable source-based frontend.

## Phase 5: Build Real Booking

Goal: make the core customer workflow real.

- [ ] Search groomers by location.
- [ ] Display real groomer cards from Supabase.
- [x] Create dog profiles tied to a real signed-in customer.
- [x] Create appointment requests tied to a real signed-in customer and dog.
- [ ] Show services and pricing from the database.
- [ ] Compute real available appointment slots.
- [ ] Prevent double booking.
- [ ] Create confirmed appointments tied to a real signed-in customer and dog.
- [ ] Show booking success only after the database insert succeeds.
- [ ] Show booking failure clearly if the insert fails.
- [ ] Support canceling and rescheduling according to product rules.
- [ ] Send booking confirmation SMS only when customer phone is valid and notification settings allow it.

Deliverable:

- [ ] A customer can book a real appointment from end to end.

## Phase 6: Build The Groomer Dashboard

Goal: make the groomer side a useful daily operations surface.

- [x] Add feature-flagged groomer account creation.
- [x] Add pending public groomer-profile claim requests.
- [x] Show appointment request packets for verified groomer memberships.
- [x] Allow verified groomers to mark requests viewed, declined, needing customer action, or routed to an external booking link.
- [ ] Show today's appointments.
- [ ] Filter by status.
- [ ] Open appointment details.
- [ ] Show dog profile, service, notes, owner name, and safe contact controls.
- [ ] Update status through the allowed workflow.
- [ ] Send status SMS after successful status update.
- [ ] Show notification send result.
- [ ] Keep an appointment status/event log.
- [ ] Add completed, canceled, no-show, and picked-up states.
- [ ] Make the UI compact and operational, not marketing-style.

Deliverable:

- [ ] A groomer can run the day's queue from the dashboard.

## Phase 7: Add Admin And Salon Controls

Goal: make the product configurable instead of hardcoded.

- [ ] Manage salon profile.
- [ ] Manage groomer staff.
- [ ] Manage services.
- [ ] Manage prices.
- [ ] Manage hours.
- [ ] Manage blocked time.
- [ ] Review customer and dog records.
- [ ] Review appointment history.
- [ ] Configure SMS templates.
- [ ] Configure notification settings.

Deliverable:

- [ ] A salon owner can operate the app without editing code.

## Phase 8: Product Polish

Goal: make the experience feel premium after the foundation is real.

Customer app:

- [ ] Improve mobile spacing and typography.
- [ ] Fix bottom nav crowding.
- [ ] Replace emoji-heavy controls where real icons or better visual language makes sense.
- [ ] Add polished skeleton/loading states.
- [ ] Add clear empty states.
- [ ] Add clear form validation.
- [ ] Add high-quality groomer images or consistent avatars.
- [ ] Make dog profile feel personal and useful.
- [ ] Make live tracker feel calm, trustworthy, and accurate.

Groomer app:

- [ ] Fix narrow-screen header clipping.
- [ ] Tighten appointment cards for scanning.
- [ ] Add clear priority/status indicators.
- [ ] Keep actions reachable with minimal taps.
- [ ] Make notification outcomes visible.
- [ ] Avoid decorative clutter.

Deliverable:

- [ ] The product looks and feels intentional, stable, and ready for a real user demo.

## Phase 9: Testing And Release Readiness

Goal: reduce regressions and make deployment boring.

- [ ] Add Playwright smoke tests for the customer app.
- [ ] Add Playwright smoke tests for the groomer dashboard.
- [ ] Add tests for SMS function validation.
- [ ] Add tests for notification function validation if OneSignal stays.
- [ ] Add RLS verification queries or Supabase tests.
- [ ] Add linting.
- [ ] Add formatting.
- [ ] Add a deploy checklist.
- [ ] Add a rollback plan.
- [ ] Add basic monitoring/logging for Netlify functions.

Deliverable:

- [ ] The app can be changed and deployed with confidence.

## Suggested Build Sequence

1. Stabilize docs and environment setup.
2. Fix Supabase auth, RLS, and protected access.
3. Replace demo auth and public dashboard behavior.
4. Define the production data model.
5. Rebuild the frontend into a real source app.
6. Build real booking.
7. Build real groomer operations.
8. Add admin controls.
9. Polish UI and product experience.
10. Add tests and release process.

## What Not To Do First

- [ ] Do not start with visual redesign before fixing auth and data ownership.
- [ ] Do not add more features to the 5,500-line `index.html`.
- [ ] Do not ship the prototype RLS policies.
- [ ] Do not rely on localStorage as real auth.
- [ ] Do not keep adding hardcoded availability.
- [ ] Do not expose customer phone numbers in a public dashboard.
- [ ] Do not keep demo controls visible in live flows.

## First Implementation Milestone

The first serious milestone should be:

- [ ] README and `.env.example` added.
- [ ] Prototype RLS file clearly marked unsafe or removed from the production path.
- [ ] Real customer auth selected and documented.
- [ ] Groomer dashboard access strategy selected and documented.
- [ ] Frontend rebuild approach selected: Vite + React or Next.js.
- [ ] A short implementation plan written for the auth/RLS hardening work.

Once that is done, the project can move from prototype cleanup into product buildout.
