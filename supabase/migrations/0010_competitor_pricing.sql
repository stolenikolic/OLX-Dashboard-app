-- =============================================================================
-- Competitor pricing: price_mode, cheap-item settings, Suboticana katalog
-- =============================================================================

create type price_mode as enum ('original', 'competitor_minus_1');

alter type job_type add value if not exists 'sync_competitors';

alter table profiles
  add column if not exists price_mode price_mode not null default 'original';

alter table app_settings
  add column if not exists competitor_undercut_km numeric(6,2) not null default 1,
  add column if not exists competitor_margin_drop numeric(5,4) not null default 0.0200;

alter table listings
  add column if not exists competitor_price numeric(12,2),
  add column if not exists competitor_seller_id bigint,
  add column if not exists competitor_matched_title text,
  add column if not exists price_floor_applied boolean not null default false;

-- -----------------------------------------------------------------------------
-- Konkurenti (Suboticani)
-- -----------------------------------------------------------------------------
create table if not exists competitor_sellers (
  olx_user_id bigint primary key,
  name        text not null,
  grp         text not null default 'suboticani',
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into competitor_sellers (olx_user_id, name, grp) values
  (41785, 'SrkiTech', 'suboticani'),
  (59418, 'SvetTehnike', 'suboticani'),
  (39288, 'DigitalTech', 'suboticani'),
  (290226, 'GeekZona', 'suboticani')
on conflict (olx_user_id) do nothing;

-- -----------------------------------------------------------------------------
-- Snapshot competitor oglasa (puni se pri svakom refresh ciklusu)
-- -----------------------------------------------------------------------------
create table if not exists competitor_listings (
  olx_listing_id    bigint primary key,
  seller_user_id    bigint not null references competitor_sellers(olx_user_id) on delete cascade,
  seller_name       text,
  title             text not null,
  category_id       bigint,
  price             numeric(12,2),
  discounted_price  numeric(12,2),
  fetched_at        timestamptz not null default now()
);

create index if not exists idx_competitor_listings_category
  on competitor_listings(category_id);

create index if not exists idx_competitor_listings_seller
  on competitor_listings(seller_user_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table competitor_sellers enable row level security;
alter table competitor_listings enable row level security;

create policy competitor_sellers_read on competitor_sellers
  for select using (auth.uid() is not null);
create policy competitor_sellers_admin on competitor_sellers
  for all using (is_admin()) with check (is_admin());

create policy competitor_listings_read on competitor_listings
  for select using (auth.uid() is not null);
create policy competitor_listings_admin on competitor_listings
  for all using (is_admin()) with check (is_admin());
