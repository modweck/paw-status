// Placeholder for repeatable Supabase hardening verification.
// This script is not wired into package.json yet.

export const SUPABASE_HARDENING_CHECK_TODOS = Object.freeze([
  'Assert anonymous customers/dogs/appointments reads return zero rows.',
  'Assert anonymous public groomer search still works with safe fields only.',
  'Assert authenticated customers can read only their own customer/dog/request rows.',
  'Assert verified groomer memberships can read only owned request packets.',
  'Assert non-admin users cannot list or review groomer membership claims.',
  'Run supabase db advisors and record accepted PostGIS/public RPC warnings.',
  'Check nearby_groomers search_path and public return fields.',
]);

export function getSupabaseHardeningCheckPlan() {
  // TODO(security): Replace this plan with executable REST/RPC probes that read
  // env from .env and fail nonzero when production RLS guarantees regress.
  return SUPABASE_HARDENING_CHECK_TODOS;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(getSupabaseHardeningCheckPlan(), null, 2));
}
