-- =============================================================================
-- OLX Dashboard — Inicijalna šema (PRIJEDLOG / skelet)
-- Postgres / Supabase. Identifikatori malim slovima, snake_case.
-- RLS uključen; admin vidi sve, radnik samo svoje profile.
-- NB: ovo je prijedlog za diskusiju, prilagoditi pri implementaciji.
-- =============================================================================

create extension if not exists "pgcrypto";        -- gen_random_uuid()

-- -----------------------------------------------------------------------------
-- Enumi
-- -----------------------------------------------------------------------------
create type app_role            as enum ('admin', 'worker');
create type profile_status      as enum ('active', 'paused', 'suspended');
create type import_override      as enum ('inherit', 'on', 'off');   -- po artiklu
create type olx_auth_method      as enum ('login', 'client_token');
create type listing_status       as enum ('draft', 'active', 'hidden', 'finished', 'failed', 'pending');
create type offer_origin         as enum ('HUF', 'BIH');
create type job_type             as enum ('sync_feed', 'post_listings', 'refresh_prices');
create type job_status           as enum ('running', 'success', 'partial', 'failed');

-- -----------------------------------------------------------------------------
-- Globalne konstante / default-i (jedan red)
-- EUR (1.95) i PDV (1.17) su fiksni u kodu; ovdje samo dokumentaciono.
-- -----------------------------------------------------------------------------
create table app_settings (
  id                smallint primary key default 1,
  default_marza     numeric(6,3) not null default 1.100,
  eur_factor        numeric(6,3) not null default 1.950,   -- fiksno u kodu
  pdv_factor        numeric(6,3) not null default 1.170,   -- fiksno u kodu
  random_pct_min    numeric(5,4) not null default 0.0100,  -- ±1%
  random_pct_max    numeric(5,4) not null default 0.0200,  -- ±2%
  daily_post_limit  integer      not null default 350,
  constraint app_settings_singleton check (id = 1)
);

-- -----------------------------------------------------------------------------
-- OLX profili (svaki profil = jedan OLX nalog / radnik)
-- -----------------------------------------------------------------------------
create table profiles (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  olx_username        text,
  status              profile_status not null default 'active',

  -- OLX autentifikacija
  auth_method         olx_auth_method not null default 'login',
  olx_login_email     text,
  olx_password_enc    text,            -- enkriptovano (Vault/pgsodium ili app-level)
  olx_client_id       text,
  olx_client_token_enc text,
  olx_bearer_token    text,            -- keširani aktivni token
  olx_token_expires_at timestamptz,

  -- Cjenovni parametri po profilu
  kurs                numeric(10,4) not null default 380,
  kurs_uvoz           numeric(10,4) not null default 350,

  -- Anti-detekcija
  device_name         text,            -- jedinstven po profilu
  user_agent          text,            -- jedinstven po profilu
  proxy_url           text,            -- host:port:user:pass (opcionalno)

  -- Automatizacija
  daily_post_limit    integer not null default 350,
  price_refresh_days  integer not null default 7,
  schedule_cron       text,            -- termin izvršavanja (po profilu)
  description_template text,           -- fiksni šablon opisa

  suspended_until     timestamptz,     -- kad je suspendovan, ne diraj do ovog vremena
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Veza auth korisnika i profila (radnik) + admin
create table profile_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  profile_id  uuid references profiles(id) on delete cascade,  -- null za admina (sve)
  role        app_role not null default 'worker',
  created_at  timestamptz not null default now(),
  unique (user_id, profile_id)
);
create index idx_profile_members_user on profile_members(user_id);
create index idx_profile_members_profile on profile_members(profile_id);

-- -----------------------------------------------------------------------------
-- Kategorije (interne -> OLX) + GLOBALNE postavke (uvoz, marže)
-- -----------------------------------------------------------------------------
create table categories (
  id                uuid primary key default gen_random_uuid(),
  internal_slug     text not null unique,          -- npr. 'vodena-hladjenja'
  internal_name     text not null,
  olx_category_id   bigint,                         -- mapiran OLX category_id
  import_flag       boolean not null default false, -- globalno: ide na uvoz (HUF)
  marza_bih         numeric(6,3) not null default 1.100,
  marza_huf         numeric(6,3) not null default 1.100,
  is_postable       boolean not null default true,  -- npr. isključi kategorije sa brand_required
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_categories_olx on categories(olx_category_id);

-- Mapiranje atributa: interni spec ključ -> OLX atribut (po kategoriji)
create table attribute_mappings (
  id               uuid primary key default gen_random_uuid(),
  category_id      uuid not null references categories(id) on delete cascade,
  spec_key         text not null,            -- npr. 'fan_size'
  olx_attribute_id bigint not null,          -- npr. 901
  required         boolean not null default false,
  fallback_value   text,                     -- ako spec nedostaje a atribut obavezan
  created_at       timestamptz not null default now(),
  unique (category_id, spec_key)
);
create index idx_attr_map_category on attribute_mappings(category_id);

-- Mapiranje vrijednosti: feed vrijednost -> OLX dozvoljena opcija
create table attribute_value_mappings (
  id                  uuid primary key default gen_random_uuid(),
  attribute_mapping_id uuid not null references attribute_mappings(id) on delete cascade,
  feed_value          text not null,         -- npr. '140mm'
  olx_value           text not null,         -- dozvoljena OLX opcija
  created_at          timestamptz not null default now(),
  unique (attribute_mapping_id, feed_value)
);
create index idx_attr_val_map on attribute_value_mappings(attribute_mapping_id);

-- -----------------------------------------------------------------------------
-- Proizvodi iz feed-a (snapshot) + ponude
-- -----------------------------------------------------------------------------
create table products (
  id                uuid primary key default gen_random_uuid(),
  feed_uuid         text not null unique,        -- feed 'id'
  title             text not null,
  shop_price        numeric(12,2),               -- referenca, NE koristi se za OLX cijenu
  category_slug     text,
  category_id       uuid references categories(id) on delete set null,
  main_image_url    text,
  specs             jsonb not null default '{}'::jsonb,
  import_override   import_override not null default 'inherit',  -- globalno po artiklu
  in_feed           boolean not null default true,  -- false kad nestane iz feed-a
  blacklisted       boolean not null default false, -- isključen iz automatizacije
  last_seen_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_products_category on products(category_id);
create index idx_products_in_feed on products(in_feed) where in_feed = true;

create table product_offers (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references products(id) on delete cascade,
  origin               offer_origin not null,            -- 'HUF' | 'BIH'
  acquisition_price    numeric(14,4) not null,
  acquisition_currency text not null,                    -- 'HUF' | 'KM'
  supplier_code        text,
  created_at           timestamptz not null default now(),
  unique (product_id, origin)
);
create index idx_offers_product on product_offers(product_id);

-- Mapiranje internog ipon_id <-> feed uuid (eksterno popunjeno)
create table ipon_feed_map (
  id          uuid primary key default gen_random_uuid(),
  ipon_id     text not null unique,
  feed_uuid   text not null unique,
  created_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Oglasi na OLX-u (po profilu) — dedup veza feed_product -> olx_listing
-- -----------------------------------------------------------------------------
create table listings (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references profiles(id) on delete cascade,
  product_id        uuid references products(id) on delete set null,
  feed_uuid         text,                       -- redundantno radi importa postojećih
  olx_listing_id    bigint,                     -- ID na OLX-u
  status            listing_status not null default 'pending',
  posted_price      numeric(12,2),
  price_origin      offer_origin,               -- iz koje ponude je cijena izračunata
  was_import        boolean not null default false,
  manual_price      numeric(12,2),              -- override formule (opcionalno)
  last_published_at timestamptz,
  last_price_sync_at timestamptz,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (profile_id, product_id),              -- dedup: 1 artikal -> 1 oglas po profilu
  unique (profile_id, olx_listing_id)
);
create index idx_listings_profile on listings(profile_id);
create index idx_listings_product on listings(product_id);
create index idx_listings_status on listings(profile_id, status);

-- Prioritet/redoslijed kategorija po profilu (postavljanje)
create table profile_category_priority (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  priority    integer not null default 100,     -- manji broj = ranije
  enabled     boolean not null default true,
  unique (profile_id, category_id)
);
create index idx_pcp_profile on profile_category_priority(profile_id, priority);

-- -----------------------------------------------------------------------------
-- Poslovi i logovi
-- -----------------------------------------------------------------------------
create table job_runs (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid references profiles(id) on delete cascade,
  job           job_type not null,
  status        job_status not null default 'running',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  items_processed integer not null default 0,
  items_succeeded integer not null default 0,
  items_failed  integer not null default 0,
  summary       text
);
create index idx_job_runs_profile on job_runs(profile_id, started_at desc);

create table job_logs (
  id          uuid primary key default gen_random_uuid(),
  job_run_id  uuid not null references job_runs(id) on delete cascade,
  level       text not null default 'info',     -- info|warn|error
  message     text not null,
  context     jsonb,
  created_at  timestamptz not null default now()
);
create index idx_job_logs_run on job_logs(job_run_id, created_at);

-- -----------------------------------------------------------------------------
-- Poruke (Faza 2 — priprema)
-- -----------------------------------------------------------------------------
create table messages (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  olx_listing_id  bigint,
  conversation_id text,
  direction       text not null default 'in',   -- in|out
  sender_name     text,
  sender_email    text,
  sender_phone    text,
  body            text,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index idx_messages_profile on messages(profile_id, created_at desc);
create index idx_messages_conv on messages(conversation_id);

-- =============================================================================
-- RLS
-- =============================================================================
alter table profiles                  enable row level security;
alter table profile_members           enable row level security;
alter table categories                 enable row level security;
alter table attribute_mappings         enable row level security;
alter table attribute_value_mappings   enable row level security;
alter table products                   enable row level security;
alter table product_offers             enable row level security;
alter table ipon_feed_map              enable row level security;
alter table listings                   enable row level security;
alter table profile_category_priority  enable row level security;
alter table job_runs                   enable row level security;
alter table job_logs                   enable row level security;
alter table messages                   enable row level security;
alter table app_settings               enable row level security;

-- Helper: je li trenutni korisnik admin
create or replace function is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profile_members
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- Helper: ima li korisnik pristup profilu
create or replace function has_profile_access(p_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select is_admin() or exists (
    select 1 from profile_members
    where user_id = auth.uid() and profile_id = p_profile_id
  );
$$;

-- Profili: admin sve; radnik samo svoje (read). Izmjene parametara: admin.
create policy profiles_select on profiles
  for select using ( has_profile_access(id) );
create policy profiles_admin_all on profiles
  for all using ( is_admin() ) with check ( is_admin() );

-- profile_members: korisnik vidi svoje; admin sve
create policy pm_select on profile_members
  for select using ( is_admin() or user_id = auth.uid() );
create policy pm_admin_all on profile_members
  for all using ( is_admin() ) with check ( is_admin() );

-- Globalni katalog/mapiranja: svi prijavljeni mogu čitati; mijenja admin
create policy cat_read on categories for select using ( auth.uid() is not null );
create policy cat_admin on categories for all using ( is_admin() ) with check ( is_admin() );

create policy attrmap_read on attribute_mappings for select using ( auth.uid() is not null );
create policy attrmap_admin on attribute_mappings for all using ( is_admin() ) with check ( is_admin() );

create policy attrval_read on attribute_value_mappings for select using ( auth.uid() is not null );
create policy attrval_admin on attribute_value_mappings for all using ( is_admin() ) with check ( is_admin() );

create policy products_read on products for select using ( auth.uid() is not null );
create policy products_admin on products for all using ( is_admin() ) with check ( is_admin() );

create policy offers_read on product_offers for select using ( auth.uid() is not null );
create policy offers_admin on product_offers for all using ( is_admin() ) with check ( is_admin() );

create policy ipon_admin on ipon_feed_map for all using ( is_admin() ) with check ( is_admin() );
create policy appset_read on app_settings for select using ( auth.uid() is not null );
create policy appset_admin on app_settings for all using ( is_admin() ) with check ( is_admin() );

-- Po-profilu tabele: pristup samo ako korisnik ima pristup tom profilu
create policy listings_access on listings
  for select using ( has_profile_access(profile_id) );
create policy listings_admin on listings
  for all using ( is_admin() ) with check ( is_admin() );

create policy pcp_access on profile_category_priority
  for select using ( has_profile_access(profile_id) );
create policy pcp_admin on profile_category_priority
  for all using ( is_admin() ) with check ( is_admin() );

create policy jobruns_access on job_runs
  for select using ( has_profile_access(profile_id) );
create policy jobruns_admin on job_runs
  for all using ( is_admin() ) with check ( is_admin() );

create policy joblogs_access on job_logs
  for select using ( exists (
    select 1 from job_runs jr
    where jr.id = job_logs.job_run_id and has_profile_access(jr.profile_id)
  ) );

create policy messages_access on messages
  for select using ( has_profile_access(profile_id) );
create policy messages_worker_update on messages
  for update using ( has_profile_access(profile_id) );

-- NB: Workeri koriste SUPABASE_SERVICE_ROLE_KEY koji zaobilazi RLS.

-- =============================================================================
-- Seed
-- =============================================================================
insert into app_settings (id) values (1) on conflict do nothing;
