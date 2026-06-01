-- Add timezone and lead-time configuration to the groomers table, and
-- install the btree_gist extension required by the GiST exclusion
-- constraint that will be added to appointments in a later migration.
--
-- btree_gist lets scalar types (UUID, INT, TEXT …) participate in GiST
-- index scans so that a mixed-type exclusion on (groomer_id, tstzrange)
-- can be expressed in a single GIST index.

-- idempotent: safe to run on a branch that already has the extension
create extension if not exists btree_gist;

-- timezone stores the IANA name ("America/New_York", "America/Los_Angeles"
-- …) used when resolving availability windows and displaying local times.
-- NOT NULL with a sensible East-Coast default so existing rows are valid.
alter table groomers
  add column if not exists timezone text not null default 'America/New_York';

-- lead_time_hours is the minimum number of hours before the appointment
-- start at which the customer must complete their booking. NULL means the
-- groomer imposes no lead-time floor and any slot shown as open can be
-- booked immediately.
alter table groomers
  add column if not exists lead_time_hours int;
