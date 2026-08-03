-- Nastavak postavljanja od zadnje kategorije (po profilu).

alter table profiles
  add column if not exists posting_category_cursor_id uuid references categories(id) on delete set null;

comment on column profiles.posting_category_cursor_id is
  'Sljedeća kategorija za automatsko postavljanje (nastavak od prošlog run-a).';
