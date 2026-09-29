-- Cloudflare D1 monetization foundation. Only verified partner/product records belong here.
create table if not exists monetization_events (
  id integer primary key autoincrement,
  event_name text not null,
  calculator text,
  partner_id text,
  product_id text,
  properties text,
  consented_at text not null,
  created_at text not null default (datetime('now'))
);

create table if not exists monetization_products (
  id text not null,
  partner_id text not null,
  provider_name text not null,
  category text not null,
  product_name text not null,
  price_amount real,
  price_currency text not null default 'CZK',
  price_period text,
  indicative_price integer not null default 0,
  updated_at text,
  excess text,
  coverage_json text not null default '[]',
  terms_url text,
  affiliate_url text not null,
  sponsored integer not null default 0,
  active integer not null default 0,
  primary key (partner_id, id)
);

create table if not exists monetization_partners (
  id text primary key,
  display_name text not null,
  active integer not null default 0,
  licensed_distributor integer not null default 0,
  registration_url text,
  categories_json text not null default '[]',
  regions_json text not null default '[]',
  priority integer not null default 0,
  lead_endpoint_secret_ref text,
  payout_model text,
  created_at text not null default (datetime('now'))
);

create table if not exists monetization_leads (
  id text primary key,
  created_at text not null default (datetime('now')),
  name text not null,
  email text not null,
  phone text not null,
  calculator text not null,
  partner_id text,
  lead_type text not null,
  calculator_result_json text,
  consent integer not null check (consent = 1),
  consent_timestamp text not null,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  status text not null default 'new' check (status in ('new','sent','contacted','qualified','converted','rejected','paid')),
  payout_amount real,
  converted_at text,
  partner_sent_at text
);

create table if not exists monetization_revenue (
  id integer primary key autoincrement,
  source_type text not null check (source_type in ('ads','affiliate','lead','direct','sponsored','premium')),
  partner_id text,
  amount real not null,
  currency text not null default 'CZK',
  reference text,
  occurred_at text not null,
  imported_at text not null default (datetime('now'))
);

create table if not exists publisher_daily_stats (
  id integer primary key autoincrement,
  report_date text not null,
  provider text not null,
  placement text not null,
  impressions integer not null default 0,
  clicks integer not null default 0,
  revenue real not null default 0,
  currency text not null default 'CZK',
  reference text,
  unique (report_date, provider, placement)
);

create table if not exists ad_placements (
  placement text primary key,
  enabled integer not null default 0,
  provider text not null default 'adsense',
  unit_id text,
  desktop_format text not null default 'responsive',
  mobile_format text not null default 'responsive',
  variant text not null default 'control',
  updated_at text not null default (datetime('now'))
);

create index if not exists monetization_events_created on monetization_events (created_at);
create index if not exists monetization_events_name_date on monetization_events (event_name, created_at);
create index if not exists monetization_events_partner on monetization_events (partner_id, created_at);
create index if not exists monetization_leads_created on monetization_leads (created_at);
create index if not exists monetization_revenue_date on monetization_revenue (occurred_at, source_type);
create index if not exists publisher_stats_date on publisher_daily_stats (report_date, provider);

-- Seed ad positions disabled: enable only after publisher IDs, CMP mode and policy checks are complete.
insert or ignore into ad_placements (placement, enabled, provider, desktop_format, mobile_format) values
('top-banner',0,'adsense','leaderboard','responsive'),
('between-hero-content',0,'adsense','responsive','responsive'),
('calculator-middle',0,'adsense','responsive','responsive'),
('calculator-bottom',0,'adsense','responsive','responsive'),
('article-inline-1',0,'adsense','responsive','responsive'),
('article-inline-2',0,'adsense','responsive','responsive'),
('before-faq',0,'adsense','responsive','responsive'),
('footer',0,'adsense','responsive','responsive'),
('sticky-mobile',0,'adsense','responsive','responsive');
