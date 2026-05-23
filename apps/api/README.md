# PawStatus API

Reserved for the proper backend service.

Current production server-side behavior still lives in `apps/web/netlify/functions`
so the existing Netlify deployment keeps working while the backend architecture
is defined.

Admin/groomer verification skeleton files live under `src/admin/`. They are not
wired into a runtime yet; they document the server-only route shape needed to
review `groomer_memberships` claims and admin access requests safely.

Additional completion skeletons:

- `src/runtime.js`: backend runtime/deploy decision TODOs.
- `src/booking/realBooking.js`: confirmed appointment and availability TODOs.
- `src/integrations/providerConfirmations.js`: Square/Calendly/Acuity/Google
  Calendar confirmation TODOs.
- `src/notifications/notificationCommands.js`: trusted notification command
  TODOs.

## TODO

- Choose the backend runtime and deploy target before adding production routes.
- Add a local `dev` command and health endpoint.
- Add auth middleware that verifies Supabase sessions server-side.
- Decide the first-admin bootstrap source before approving admins from `/admin`.
- Add migrations for admin users/access requests/audit events and groomer
  membership review events.
- Move guest booking and guest claim logic out of `apps/web/server`.
- Add rate limiting, request ids, structured logs, and error normalization.
- Add transactional booking-request creation through Postgres RPCs or explicit
  database transactions.
- Add real availability, conflict checks, and confirmed appointment creation.
- Add provider webhook/API confirmation handlers for external booking providers.
- Add notification command routes that load trusted appointment/request data
  server-side before sending SMS or push notifications.
- Add admin-only routes for groomer membership review and verification.
- Add tests that cover route auth, validation, happy paths, provider failures,
  and forbidden cross-account access.
