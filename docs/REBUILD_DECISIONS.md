# PawStatus Rebuild Decisions

This document records the initial decisions for taking PawStatus from prototype to production-quality product. These are starting decisions, not permanent constraints.

## Product Split

PawStatus should be split into three surfaces:

- Customer app: search groomers, book appointments, manage dogs, track grooming status.
- Groomer dashboard: manage the day's appointments and update live status.
- Admin/salon tools: manage salon profile, services, prices, staff, hours, and notification templates.

The customer app should feel polished and mobile-first. The groomer dashboard should feel compact, operational, and fast to scan.

## Frontend Direction

Recommended path:

- Use Vite + React for the rebuild.
- Keep the current static HTML files only as reference during migration.
- Move source code into `src/`.
- Keep deployment on Netlify unless the product needs a different host later.

Why this direction:

- The current project does not need server-rendering to become useful.
- Vite keeps the rebuild lightweight.
- React gives enough structure for reusable components, state, and route-level separation.
- Netlify already matches the current deployment model and functions folder.

Initial target structure:

```text
src/
  api/
  auth/
  customer/
  groomer/
  admin/
  components/
  styles/
  utils/
```

## Supabase Direction

Supabase should remain the backend.

Required changes:

- Use Supabase Auth for customers.
- Use Supabase Auth for groomers.
- Add salon or organization ownership tables.
- Use RLS for all exposed customer, dog, appointment, groomer, and salon data.
- Keep secret/service keys only in trusted scripts or Netlify functions.

The current `db/02_relax_rls_prototype.sql` file is not production-safe and should only be used to understand the prototype state.

## Auth Direction

Customer auth should start with a low-friction flow:

- Phone OTP if SMS cost and setup are acceptable.
- Magic link email if phone OTP is too much friction or cost for the first pass.

Current recommendation: start with email magic links. See `docs/SUPABASE_MAGIC_LINK_NOTES.md`.

Groomer auth should be stricter:

- Email-based sign-in.
- Groomer account must be linked to a salon or organization membership.
- Dashboard access must check membership before showing appointment data.

## Booking Direction

The current app has demo-style booking slots. Production booking needs:

- Services with duration and price.
- Groomer or salon working hours.
- Existing appointment conflict checks.
- Buffer time rules.
- Cancel and reschedule rules.
- A clear failure path when a slot is no longer available.

Booking confirmation should only show after the appointment insert succeeds.

Guest booking should stay server-side. Signed-out customers can submit a full booking request packet, but the browser should call a Netlify function that validates the packet and creates `customers`, `dogs`, and `appointment_requests` with a server-only Supabase key. The app should keep confirmed `appointments` closed until a groomer or integration can actually confirm the slot.

## Notification Direction

SMS should be the first production notification channel.

OneSignal push notifications are optional and should be removed unless there is a clear reason to keep them.

Status notifications should be triggered only after:

- A valid status transition succeeds.
- The customer has a valid phone number.
- The notification function validates the payload.

## Data Safety Rules

- Do not expose customer phone numbers to public routes.
- Do not expose service role or secret keys in browser code.
- Do not trust localStorage as proof of identity.
- Do not build dynamic HTML from unescaped Supabase, Google Places, or user-entered values.
- Do not allow direct public status updates without an ownership check.

## Migration Strategy

Do not attempt a full rewrite in one pass.

Recommended order:

1. Stabilize docs and environment setup.
2. Implement real auth and RLS.
3. Protect the groomer dashboard.
4. Create the Vite + React app shell.
5. Port customer search and booking.
6. Port groomer dashboard.
7. Add real availability.
8. Add admin/salon controls.
9. Polish UI.
10. Add smoke tests and release checks.

## Open Decisions

- [ ] Customer auth: phone OTP or email magic link.
- [ ] Whether OneSignal stays or the first production version is SMS-only.
- [ ] Whether waitlist ships in the first production version.
- [ ] Whether chat ships in the first production version.
- [ ] Whether admin tools are built immediately or after customer/groomer flows stabilize.
