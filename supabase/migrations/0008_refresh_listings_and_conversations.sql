-- =============================================================================
-- Refresh listings (bump) + conversations ingestion for demand-driven scoring
-- =============================================================================

alter type job_type add value if not exists 'sync_conversations';
alter type job_type add value if not exists 'refresh_listings';

-- -----------------------------------------------------------------------------
-- Conversations (inquiry metadata for scoring; full chat UI = Faza 2)
-- -----------------------------------------------------------------------------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  olx_conversation_id bigint not null,
  buyer_id bigint,
  buyer_username text,
  olx_listing_id bigint,
  listing_title text,
  olx_category_id bigint,
  last_message_type text,
  last_message_at timestamptz,
  inquiry_at timestamptz,
  unread_count integer not null default 0,
  is_system boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (profile_id, olx_conversation_id)
);

create index if not exists idx_conv_profile_listing
  on conversations(profile_id, olx_listing_id);

create index if not exists idx_conv_profile_inquiry
  on conversations(profile_id, inquiry_at desc)
  where is_system = false;

-- -----------------------------------------------------------------------------
-- Listings: refresh tracking
-- -----------------------------------------------------------------------------
alter table listings
  add column if not exists last_refreshed_at timestamptz,
  add column if not exists refresh_available boolean not null default false,
  add column if not exists refresh_score numeric,
  add column if not exists last_score_at timestamptz;

-- -----------------------------------------------------------------------------
-- Refresh events (audit log)
-- -----------------------------------------------------------------------------
create table if not exists refresh_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  listing_id uuid references listings(id) on delete set null,
  olx_listing_id bigint not null,
  refreshed_at timestamptz not null default now(),
  score_at_time numeric,
  was_manual boolean not null default false,
  was_paid boolean not null default false
);

create index if not exists idx_refresh_events_profile
  on refresh_events(profile_id, refreshed_at desc);

-- -----------------------------------------------------------------------------
-- Profiles: cached refresh budget
-- -----------------------------------------------------------------------------
alter table profiles
  add column if not exists refresh_free_limit integer,
  add column if not exists refresh_free_count integer,
  add column if not exists refresh_limits_synced_at timestamptz,
  add column if not exists refresh_overrides jsonb;

-- -----------------------------------------------------------------------------
-- App settings: score weights + windows
-- -----------------------------------------------------------------------------
alter table app_settings
  add column if not exists refresh_enabled boolean not null default true,
  add column if not exists refresh_w_inquiry numeric not null default 0.50,
  add column if not exists refresh_w_category numeric not null default 0.20,
  add column if not exists refresh_w_value numeric not null default 0.15,
  add column if not exists refresh_w_staleness numeric not null default 0.15,
  add column if not exists refresh_inquiry_window_days integer not null default 180,
  add column if not exists refresh_inquiry_halflife_days integer not null default 60,
  add column if not exists refresh_staleness_cap_days integer not null default 30,
  add column if not exists refresh_unmapped_penalty numeric not null default 0.85;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table conversations enable row level security;
alter table refresh_events enable row level security;

create policy conv_access on conversations
  for select using ( has_profile_access(profile_id) );
create policy conv_admin on conversations
  for all using ( is_admin() ) with check ( is_admin() );

create policy revents_access on refresh_events
  for select using ( has_profile_access(profile_id) );
create policy revents_admin on refresh_events
  for all using ( is_admin() ) with check ( is_admin() );
