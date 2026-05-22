# PawStatus API

Reserved for the proper backend service.

Current production server-side behavior still lives in `apps/web/netlify/functions`
so the existing Netlify deployment keeps working while the backend architecture
is defined.

## TODO

- Choose the backend runtime and deploy target before adding production routes.
- Add a local `dev` command and health endpoint.
- Add auth middleware that verifies Supabase sessions server-side.
- Move guest booking and guest claim logic out of `apps/web/server`.
- Add rate limiting, request ids, structured logs, and error normalization.
- Add transactional booking-request creation through Postgres RPCs or explicit
  database transactions.
- Add notification command routes that load trusted appointment/request data
  server-side before sending SMS or push notifications.
- Add admin-only routes for groomer membership review and verification.
- Add tests that cover route auth, validation, happy paths, provider failures,
  and forbidden cross-account access.
