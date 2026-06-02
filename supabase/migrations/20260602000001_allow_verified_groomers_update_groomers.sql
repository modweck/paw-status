-- Let a verified groomer edit a safe subset of their own groomers business row.
--
-- Two layers, matching the patterns already used in this schema:
--   * RLS UPDATE policy  → restricts WHICH rows (only groomers the caller owns
--     through a verified membership), mirroring the groomer_offerings policies.
--   * Column-level GRANT → restricts WHAT can change (only the business/contact
--     and slot-config fields), mirroring the appointment_requests column grant.
--
-- Together: a verified groomer may update only name/salon/phone/website/
-- timezone/lead_time_hours on their own groomer row, and can never touch
-- id, google_place_id, lat/lng/location, rating, review_count, or created_at.

grant update (name, salon, phone, website, timezone, lead_time_hours)
  on table groomers
  to authenticated;

drop policy if exists "verified groomers update own groomer" on groomers;
create policy "verified groomers update own groomer"
  on groomers
  for update
  to authenticated
  using (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomers.id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from groomer_memberships gm
      join groomer_accounts ga on ga.id = gm.groomer_account_id
      where gm.groomer_id = groomers.id
        and gm.status = 'verified'
        and ga.auth_user_id = (select auth.uid())
    )
  );
