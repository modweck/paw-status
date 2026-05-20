-- Guest booking requests are created by a server-side Netlify function.
-- The opaque claim token itself is never stored; only its SHA-256 hash is.

alter table appointment_requests
  add column if not exists guest_claim_token_hash text,
  add column if not exists guest_claim_expires_at timestamptz,
  add column if not exists guest_claimed_at timestamptz;

create unique index if not exists appointment_requests_guest_claim_token_hash_idx
on appointment_requests (guest_claim_token_hash)
where guest_claim_token_hash is not null;
