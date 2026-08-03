-- Brojanje dnevnih pokušaja postavljanja (max 3 bez uspješne objave / limita).

alter table profiles
  add column if not exists posting_attempt_date date,
  add column if not exists posting_attempt_count integer not null default 0;

comment on column profiles.posting_attempt_date is
  'Datum (Europe/Sarajevo) zadnjeg pokušaja postavljanja bez otvorenog prozora.';
comment on column profiles.posting_attempt_count is
  'Broj pokušaja na posting_attempt_date (reset kad prozor otvori ili novi dan).';
