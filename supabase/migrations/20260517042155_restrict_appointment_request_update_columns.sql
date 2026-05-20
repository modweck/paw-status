-- Restrict browser-side groomer request updates to status/handoff metadata only.
-- RLS limits which rows can be updated; column grants limit what can be changed.

revoke update on table appointment_requests from authenticated;

grant update (status, external_booking_url, updated_at)
on table appointment_requests
to authenticated;
