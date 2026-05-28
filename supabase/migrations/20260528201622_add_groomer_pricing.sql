-- Store per-groomer service pricing harvested from each groomer's own
-- website (via the LLM extractor in scripts/extract-groomer-pricing.js)
-- and, later, Google Places priceLevel/priceRange as a fallback for the
-- ~60% of groomers who don't publish prices publicly.
--
-- One row per (groomer, service, dog_size). A groomer can have many rows.
-- price_low and price_high are nullable so flat-fee pricing ("Bath: $65")
-- can store the same value in both, or a single value with only price_low.
-- dog_size is nullable so flat services that don't vary by size (e.g.
-- nail trim) just leave it null.

create table if not exists groomer_pricing (
  id uuid primary key default gen_random_uuid(),
  groomer_id uuid not null references groomers(id) on delete cascade,
  service text not null,
  dog_size text,
  price_low numeric(8, 2),
  price_high numeric(8, 2),
  currency text not null default 'USD',
  source text not null check (source in ('website', 'google_places', 'manual')),
  source_url text,
  raw_text text,
  extracted_at timestamptz not null default now()
);

create index if not exists groomer_pricing_groomer_idx
on groomer_pricing (groomer_id);

create index if not exists groomer_pricing_groomer_service_size_idx
on groomer_pricing (groomer_id, service, dog_size);

-- Public read so the customer card can render a price chip. Inserts /
-- updates happen via the service role from the extractor script.
alter table groomer_pricing enable row level security;

revoke all on table groomer_pricing from anon, authenticated;
grant select on table groomer_pricing to anon, authenticated;

drop policy if exists "groomer_pricing readable" on groomer_pricing;
create policy "groomer_pricing readable"
on groomer_pricing
for select
using (true);
