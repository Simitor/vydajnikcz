-- Výdajník.cz schema for a future Supabase/PostgreSQL deployment.
create table if not exists public.legislation_constants (
  id bigint generated always as identity primary key,
  parameter_key text not null,
  label text not null,
  year integer not null,
  value numeric not null,
  unit text not null default '',
  valid_from date not null,
  valid_to date,
  source_url text,
  updated_at timestamptz not null default now(),
  unique (parameter_key, year, valid_from)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text not null,
  calculator text not null,
  result jsonb,
  consent boolean not null check (consent),
  consented_at timestamptz not null default now(),
  partner text,
  source_ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists legislation_constants_lookup on public.legislation_constants (parameter_key, year, valid_from desc);
create index if not exists leads_created_at on public.leads (created_at desc);

alter table public.legislation_constants enable row level security;
alter table public.leads enable row level security;
-- Public browser access intentionally has no policies. Write leads through a trusted server endpoint only.

insert into public.legislation_constants (parameter_key, label, year, value, unit, valid_from, source_url) values
('taxpayer_credit', 'Sleva na poplatníka', 2026, 30840, 'CZK/year', '2026-01-01', 'https://financnisprava.gov.cz/'),
('flat_tax_band_1', 'Paušální režim I. pásmo (měsíčně)', 2026, 9162, 'CZK/month', '2026-07-01', 'https://financnisprava.gov.cz/cs/financni-sprava/media-a-verejnost/tiskove-zpravy-gfr/tiskove-zpravy-2025/pausalni-dan-2026-novinky-terminy'),
('osvc_health_min', 'Minimální záloha OSVČ na zdravotní pojištění', 2026, 3306, 'CZK/month', '2026-01-01', 'https://www.vzp.cz/platci/informace/osvc/osvc-minimalni-vyse-zaloh')
on conflict (parameter_key, year, valid_from) do update set value = excluded.value, source_url = excluded.source_url, updated_at = now();
