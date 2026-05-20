alter table dogs
  add column if not exists preferred_service_id text,
  add column if not exists preferred_groomer_id uuid references groomers(id) on delete set null,
  add column if not exists preferred_groomer_name text;

create index if not exists dogs_preferred_groomer_idx on dogs (preferred_groomer_id);
