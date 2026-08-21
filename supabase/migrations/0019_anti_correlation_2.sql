-- Anti-korelacija faza 2: rjeđa validacija OLX tokena.
alter table profiles
  add column if not exists olx_token_checked_at timestamptz;
