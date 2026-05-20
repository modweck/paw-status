alter table public.customers
  add column if not exists username text;

create unique index if not exists customers_username_lower_key
  on public.customers (lower(username))
  where username is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_username_format_check'
  ) then
    alter table public.customers
      add constraint customers_username_format_check
      check (username is null or username ~ '^[A-Za-z0-9_]{3,32}$');
  end if;
end $$;
