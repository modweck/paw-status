-- Promote the appointments table from a prototype in-salon-tracking table
-- to a first-class booking record.
--
-- Changes:
--   1. Rename the existing appointment_status enum column to salon_status so
--      the in-salon workflow tracking is preserved but no longer collides with
--      the new booking-level status field.
--   2. Add booking-centric columns: service_id, price_cents, start_at, end_at,
--      and status (TEXT, default 'confirmed').
--   3. Relax NOT NULL on the legacy service column so new rows that arrive via
--      service_id do not need to duplicate the service name string.
--   4. Add a GiST exclusion constraint that prevents double-booking: no two
--      confirmed appointments for the same groomer may have overlapping time
--      ranges. The WHERE predicate limits enforcement to rows that have been
--      assigned an actual time slot (start_at IS NOT NULL).
--      Requires btree_gist (installed in migration …000001).

-- ---------------------------------------------------------------------------
-- Step 1: Rename enum status → salon_status (idempotent guard)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'appointments'
      and column_name  = 'status'
      and udt_name     = 'appointment_status'
  ) then
    alter table appointments rename column status to salon_status;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Step 2: Add new booking-level columns
-- ---------------------------------------------------------------------------

-- Foreign key to the groomer_offerings catalog entry.
-- Nullable so that legacy appointments (booked before offerings existed) are
-- still valid rows.
alter table appointments
  add column if not exists service_id uuid
    references groomer_offerings(id) on delete set null;

-- Canonical price captured at booking time (in cents) so price changes to the
-- offering catalog do not silently alter historical booking values.
alter table appointments
  add column if not exists price_cents int;

-- Explicit start / end timestamps replace the single scheduled_at field and
-- allow the exclusion constraint to check for overlap rather than just equality.
alter table appointments
  add column if not exists start_at timestamptz;

alter table appointments
  add column if not exists end_at timestamptz;

-- Booking-level lifecycle status. Values expected by the application layer:
-- 'confirmed', 'cancelled', 'no_show', 'completed'.
-- Default 'confirmed' so existing rows populated by the migration read as
-- already-confirmed bookings.
alter table appointments
  add column if not exists status text default 'confirmed';

-- ---------------------------------------------------------------------------
-- Step 3: Relax NOT NULL on legacy columns
-- ---------------------------------------------------------------------------

-- service was used as a free-text label before structured offerings existed.
-- New bookings reference service_id instead; the column is kept for legacy
-- rows and for groomers who have not yet migrated to the catalog.
alter table appointments
  alter column service drop not null;

-- price is already nullable in the baseline; this is a no-op but is kept
-- explicitly for documentation clarity.
alter table appointments
  alter column price drop not null;

-- ---------------------------------------------------------------------------
-- Step 4: GiST exclusion constraint — no overlapping slots per groomer
-- ---------------------------------------------------------------------------
-- The constraint only fires on rows where start_at IS NOT NULL (i.e., the
-- appointment has been assigned a concrete time slot). Draft or legacy rows
-- with no start_at are excluded from the check.
--
-- tstzrange(start_at, end_at) produces a half-open interval [start, end) so
-- back-to-back appointments (end of one == start of next) are NOT considered
-- overlapping, matching the expected salon-schedule behaviour.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname      = 'appointments_no_double_book'
      and conrelid     = 'appointments'::regclass
  ) then
    alter table appointments
      add constraint appointments_no_double_book
      exclude using gist (
        groomer_id with =,
        tstzrange(start_at, end_at) with &&
      )
      where (start_at is not null);
  end if;
end $$;

-- Supporting index on the new time columns for range queries.
create index if not exists appointments_groomer_timerange_idx
  on appointments (groomer_id, start_at, end_at)
  where start_at is not null;
