# Groomer Account Request Handling Slice

This is the next implementation slice for groomer-owned request handling and calendar-provider groundwork.

## Implementation Status

Implemented in the React/Supabase slice:

- `groomer_accounts`
- `groomer_memberships` with `pending`, `verified`, and `rejected` status values
- `booking_channels` safe metadata table
- `calendar_connections` safe metadata table
- `/groomer` auth-gated account creation
- pending groomer profile claim requests
- verified-membership reads of owned `appointment_requests`
- verified-membership updates to `viewed`, `declined`, `needs_customer_action`, and `external_handoff`
- booking packet display with dog, customer, service, preferred windows, notes, and contact fields

Still next:

- Admin/review flow for marking pending groomer claims `verified` or `rejected`
- Real calendar OAuth/token sync, server-side only
- Confirmed `appointments` creation

## Admin Verification Skeleton

Added skeleton structure:

- `apps/api/src/admin/groomerVerification.js`
- `apps/api/src/admin/adminAccess.js`
- `apps/api/src/admin/README.md`
- `apps/web/src/admin/AdminVerificationPanel.jsx`
- `apps/web/src/api/adminVerification.js`
- shared status/review constants in `packages/core/src/index.js`

The `/admin` route now has a Supabase-auth login shell and dashboard sections
for groomer claim review and admin access review. The intended production path
is still server-side only: a trusted admin reviews a pending
`groomer_memberships` row, the backend verifies admin authorization, updates the
row to `verified` or `rejected`, writes an audit event, and notifies the groomer.
The browser must not directly update claim status with a public Supabase client.
Admin approval has the same rule: the first admin must be bootstrapped from a
trusted server-owned source before the page can approve additional admins.

## Verbatim Slice

Yes. The right build is **groomer-owned request handling first**, calendar sync second.

**Provider Strategy**
Start with:
- **Square**: best first “real booking” integration. Square has a Bookings API that can create bookings, but it needs seller OAuth/scopes and the right Square Appointments plan.
- **Google Calendar**: good for availability/free-busy and calendar holds, not a universal groomer booking system.
- **Google Business Profile links**: useful to discover/route to appointment links when present. We should not assume we can book any groomer “through Google.”
- **Calendly / Acuity**: good next tier because they support booking links/APIs/webhooks.
- **Fresha, Vagaro, Booksy**: start as link/widget handoff providers unless we get proper API/partner access.

For groomers who do not integrate, we make the saved customer info go as far as possible by creating a **booking packet**: dog, service, preferred windows, customer notes, phone/email, and a groomer-specific handoff link/call script. Then route:
1. known booking URL
2. Google Business Profile appointment/action link
3. groomer website
4. phone/text/email handoff
5. later: concierge/admin assisted booking

**First Code Slice I Recommend**
Build this now:

- `groomer_accounts`
  - tied to `auth.users.id`
- `groomer_memberships`
  - links a signed-in groomer account to one or more `groomers.id`
  - status: `pending`, `verified`, `rejected`
- `booking_channels`
  - provider: `square`, `google_business_profile`, `google_calendar`, `calendly`, `acuity`, `fresha`, `vagaro`, `booksy`, `website`, `phone`, `email`
  - stores safe metadata/links only, not OAuth secrets
- `calendar_connections`
  - metadata only for now: provider, status, external account label
  - no OAuth token storage yet
- `/groomer`
  - require auth
  - load verified groomer memberships
  - show owned `appointment_requests`
  - allow `viewed`, `declined`, `needs_customer_action`, and “send customer to external booking link”
  - no confirmed `appointments` yet

OAuth/token sync should be second slice, server-side only. Tokens should never be in browser-readable tables.

Sources:
- Square Bookings API: https://developer.squareup.com/reference/square/bookings-api/create-booking
- Google Calendar free/busy: https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query
- Google Business Profile action links: https://developers.google.com/my-business/reference/placeactions/rest/v1/locations.placeActionLinks
- Calendly API overview: https://help.calendly.com/hc/en-us/articles/26595353029271-Calendly-API-overview
- Acuity API: https://developers.acuityscheduling.com/reference/get-appointments
