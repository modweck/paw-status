-- Audit log for admin-driven groomer_memberships claim reviews.
-- One row per approve/reject action so we can answer "who approved what, when,
-- with what note" beyond the bare updated_at/status on groomer_memberships.
--
-- Browser clients never touch this table directly; the backend writes/reads
-- through the service role only.

create table if not exists groomer_membership_review_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references groomer_memberships(id) on delete cascade,
  reviewer_auth_user_id uuid not null references auth.users(id) on delete restrict,
  reviewer_email text not null,
  decision text not null check (decision in ('verify', 'reject')),
  previous_status text not null check (previous_status in ('pending', 'verified', 'rejected')),
  next_status text not null check (next_status in ('verified', 'rejected')),
  reviewer_note text,
  created_at timestamptz not null default now()
);

create index if not exists groomer_membership_review_events_membership_idx
on groomer_membership_review_events (membership_id, created_at desc);

create index if not exists groomer_membership_review_events_reviewer_idx
on groomer_membership_review_events (reviewer_auth_user_id, created_at desc);

alter table groomer_membership_review_events enable row level security;

-- Strip anon/authenticated grants so browser clients with the publishable key
-- cannot read or write the audit log. The backend uses the service role which
-- bypasses RLS and does not depend on these grants.
revoke all on table groomer_membership_review_events from anon, authenticated;
