-- Fiksni termin postavljanja po profilu + sidro rolling 24h OLX prozora.

alter table profiles
  add column if not exists post_schedule_time time,
  add column if not exists posting_window_started_at timestamptz;

comment on column profiles.post_schedule_time is
  'Željeni lokalni termin pokretanja postavljanja (Europe/Sarajevo).';
comment on column profiles.posting_window_started_at is
  'Početak tekućeg OLX 24h prozora (= prvi uspješan publish u ciklusu).';

-- Backfill: razmaknuti slotovi 08:00–19:40, korak 20 min (36 slotova),
-- deterministički po md5(id) da migracija bude stabilna.
with ordered as (
  select
    id,
    (row_number() over (order by md5(id::text)) - 1) as idx
  from profiles
  where post_schedule_time is null
)
update profiles p
set
  post_schedule_time = (time '08:00' + ((o.idx % 36) * interval '20 minutes'))::time,
  updated_at = now()
from ordered o
where p.id = o.id;
