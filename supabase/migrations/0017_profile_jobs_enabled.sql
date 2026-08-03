-- Per-profile job toggles (automatizacija po poslu).
-- Default: svi poslovi uključeni — postojeći profili zadržavaju ponašanje.

alter table profiles
  add column if not exists jobs_enabled jsonb not null default '{
    "post_listings": true,
    "refresh_prices": true,
    "sync_stock": true,
    "refresh_listings": true,
    "sync_conversations": true,
    "sync_messages": true
  }'::jsonb;

comment on column profiles.jobs_enabled is
  'Per-profile prekidači za GHA/automatizovane poslove. false = posao se ne pokreće za taj profil.';
