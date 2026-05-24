-- Align appointment_requests.status CHECK constraint with the values the
-- groomer-side code already tries to write.
--
-- The original constraint (20260517031448) allowed only:
--   requested, external_handoff, confirmed, declined, expired
--
-- But 20260517040729 and 20260519182415 added RLS policies that permit
-- updates setting status to 'viewed' or 'needs_customer_action'. Those
-- RLS clauses do not bypass column CHECK constraints, so every groomer
-- attempt to mark a request as viewed/needs_customer_action currently
-- fails with a check_violation in production.
--
-- This migration drops and re-creates the CHECK constraint to include the
-- two missing values, matching the public surface area already advertised
-- by the request handling policies.

begin;

alter table public.appointment_requests
  drop constraint if exists appointment_requests_status_check;

alter table public.appointment_requests
  add constraint appointment_requests_status_check
  check (
    status in (
      'requested',
      'viewed',
      'needs_customer_action',
      'external_handoff',
      'confirmed',
      'declined',
      'expired'
    )
  );

commit;
