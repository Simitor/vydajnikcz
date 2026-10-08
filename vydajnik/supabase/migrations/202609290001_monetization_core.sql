-- Monetization foundation. These tables are private by default; no public policies exist.
create schema if not exists private;

create table if not exists private.monetization_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('insurance', 'energy', 'mortgage', 'refinance', 'banking', 'savings', 'consolidation', 'advertising')),
  website_url text,
  partner_program_id text,
  terms_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'paused', 'rejected')),
  approval_verified_at timestamptz,
  accepts_lead_categories text[] not null default '{}',
  regions text[] not null default '{}',
  max_leads_per_day integer check (max_leads_per_day is null or max_leads_per_day >= 0),
  delivery_method text check (delivery_method in ('manual', 'webhook', 'api', 'email')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.affiliate_partners (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references private.monetization_partners(id),
  name text not null,
  category text not null,
  official_url text not null,
  affiliate_url text,
  program_id text,
  commission_type text,
  terms_url text,
  conditions_note text,
  priority integer not null default 100,
  paid_placement boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'active', 'paused', 'rejected')),
  approval_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.ad_slots (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null unique,
  page_key text not null,
  position_key text not null,
  network text not null check (network in ('adsense', 'ad_manager', 'direct')),
  provider_slot_id text,
  format text not null default 'responsive',
  enabled boolean not null default false,
  min_height_px integer not null default 100 check (min_height_px between 0 and 1000),
  mobile_enabled boolean not null default true,
  desktop_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references private.monetization_partners(id),
  slot_id uuid references private.ad_slots(id),
  name text not null,
  creative_url text,
  click_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'active', 'paused', 'ended')),
  commercial_disclosure text not null default 'Reklama',
  commercial_terms_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.leads (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('insurance', 'energy', 'mortgage', 'refinance', 'consolidation')),
  partner_id uuid not null references private.monetization_partners(id),
  status text not null default 'received' check (status in ('received', 'queued', 'sent', 'accepted', 'rejected', 'deleted', 'error')),
  payload jsonb not null,
  privacy_notice_version text not null,
  created_at timestamptz not null default now(),
  retention_until timestamptz not null
);

create table if not exists private.lead_consents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references private.leads(id) on delete cascade,
  partner_id uuid not null references private.monetization_partners(id),
  purpose text not null,
  recipient_name_snapshot text not null,
  notice_version text not null,
  granted boolean not null check (granted = true),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  consent_copy_hash text not null
);

create table if not exists private.lead_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references private.leads(id) on delete cascade,
  partner_id uuid not null references private.monetization_partners(id),
  method text not null,
  status text not null check (status in ('queued', 'sent', 'accepted', 'rejected', 'error')),
  response_code integer,
  response_reference text,
  attempted_at timestamptz not null default now()
);

create table if not exists private.monetization_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('ad_impression', 'affiliate_click', 'calculation_complete', 'lead_submitted', 'lead_delivered')),
  slot_key text,
  partner_id uuid references private.monetization_partners(id),
  category text,
  created_at timestamptz not null default now(),
  source text not null default 'manual'
);

create table if not exists private.monetization_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['monetization_partners','affiliate_partners','ad_slots','ad_campaigns','leads','lead_consents','lead_delivery_attempts','monetization_events','monetization_audit_log'] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on private.%I from anon, authenticated', t);
    execute format('grant all on private.%I to service_role', t);
  end loop;
end $$;

-- Keep the private schema unavailable to browser roles. Server integrations must use a
-- server-only Supabase service key and perform explicit input/consent validation.
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
