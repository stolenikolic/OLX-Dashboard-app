alter type public.job_type add value if not exists 'manual_action';

alter table public.profiles
  add column if not exists job_pacing jsonb,
  add column if not exists job_schedule jsonb,
  add column if not exists price_variance_low_pct numeric,
  add column if not exists price_variance_high_pct numeric,
  add column if not exists olx_shop_profile jsonb,
  add column if not exists olx_shop_profile_synced_at timestamptz;
