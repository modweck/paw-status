-- Admin and groomer-review schema TODO.
-- This file is intentionally not under supabase/migrations/ because it is not
-- ready to apply. Turn this into real migrations after the admin auth model is
-- chosen and verified locally.

-- TODO(admin): Choose the first-admin bootstrap authority:
-- - Supabase auth.users app_metadata set by service role, or
-- - private public.admin_users table with RLS/service-role writes, or
-- - server-only ADMIN_BOOTSTRAP_EMAILS allowlist for initial setup.

-- TODO(admin): Add admin_access_requests with requester auth_user_id/email,
-- status pending/approved/denied, requester note, reviewer note, reviewed_by,
-- reviewed_at, created_at, and updated_at.

-- TODO(admin): Add admin_audit_events with actor auth_user_id, action,
-- target_type, target_id, previous_state, next_state, request_id, ip/user-agent
-- metadata if available, and created_at.

-- TODO(admin): Add groomer_membership_review_events so claim status is auditable
-- beyond the current groomer_memberships.status and updated_at fields.

-- TODO(admin): Add RLS/grants so browser clients cannot approve admin access or
-- groomer membership claims directly. Review writes should go through a
-- server-side command using a service key or tightly scoped RPC.
