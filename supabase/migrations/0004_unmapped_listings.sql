-- Snapshot nemapiranih OLX oglasa po profilu (samo aktivni, bez veze na feed).
-- Punjenje: ručno dugme u dashboardu. Brisanje svih: GitHub Actions worker.

alter type job_type add value if not exists 'delete_unmapped';

create table unmapped_listings (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  olx_listing_id  bigint not null,
  title           text not null,
  price           numeric(12,2),
  olx_category_id bigint,
  image_url       text,
  synced_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (profile_id, olx_listing_id)
);

create index idx_unmapped_listings_profile on unmapped_listings(profile_id);
create index idx_unmapped_listings_title on unmapped_listings(profile_id, title);

alter table unmapped_listings enable row level security;

-- Admin-only (feature je samo za admina)
create policy unmapped_listings_admin on unmapped_listings
  for all using ( is_admin() ) with check ( is_admin() );
