-- Obavezni OLX atributi za nove feed kategorije (0011) koje nisu imale mapping.
-- Svaki required attr ima fallback_value za prazan feed specs.

-- === action-kamere → #2352 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__derived_camera_resolution', 7843, true, '1080p (Full HD)')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'action-kamere'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'action-kamere'
cross join (values
  ('1080p', '1080p (Full HD)'),
  ('720p',  '720p (HD)'),
  ('4K',    '2160p (4K)'),
  ('8K',    '4320p (8K)'),
  ('Ostalo','Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = '__derived_camera_resolution'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === audio-miksete → #1228 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_broj_kanala', 4994, true, '1 do 8')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'audio-miksete'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === blu-ray-i-dvd-plejeri → #2093 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta', 5111, true, 'Ostalo')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'blu-ray-i-dvd-plejeri'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === bluetooth-zvucnici → #2392 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('sound_power', 7675, true, '10')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'bluetooth-zvucnici'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === digitalni-fotoaparati → #112 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('megapixel',                   527,  true, 'Ostalo'),
  ('__default_tip_fotoaparata',   2401, true, 'Ostali'),
  ('__derived_camera_resolution', 3431, true, '1080p (Full HD)')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'digitalni-fotoaparati'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'digitalni-fotoaparati'
cross join (values
  ('1080p', '1080p (Full HD)'),
  ('720p',  '720p (HD)'),
  ('4K',    '2160p (4K)'),
  ('8K',    '4320p (8K)'),
  ('Ostalo','Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = '__derived_camera_resolution'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === dronovi → #2115 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_domet',          7304, true, '1000 m'),
  ('__default_vrijeme_leta',   7305, true, '11 do 15 min')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'dronovi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === gaming-kontroleri + joystick → #2051 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta_spajanja', 4961, true, 'Ostalo'),
  ('__default_namjena',        7457, true, 'Ostalo')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug in ('gaming-kontroleri', 'joystick-i-flight-kontroleri')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === gaming-konzole → #292 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta_oglasa', 7099, true, 'Prodaja'),
  ('__default_dzojstici',    4835, true, '1'),
  ('__default_platforma',    1056, true, 'Ostalo')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'gaming-konzole'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === igre → #290 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_platforma_igre', 1059, true, 'Ostalo'),
  ('__default_vrsta_igre',     5176, true, 'Fizički medij')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'igre'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === mobilni-telefoni + klasicni → #31 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('operating_system',  2079, true, 'Android'),
  ('internal_storage',  2270, true, '128 GB'),
  ('ram',               2302, true, '8 GB')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug in ('mobilni-telefoni', 'klasicni-telefoni')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === memorija-i-diskovi → #271 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('capacity',     1052, true, '32GB'),
  ('speed_class',  2998, true, 'Ostalo'),
  ('card_type',    3000, true, 'microSD')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'memorija-i-diskovi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === mp3-plejeri → #47 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('capacity',        3425, true, '8'),
  ('__default_vrsta', 3426, true, 'Audio')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'mp3-plejeri'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === pametni-satovi → #2076 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('operating_system', 5060, true, 'Android'),
  ('color',            5058, true, 'Crna')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'pametni-satovi-i-narukvice'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === powerbank → #2154 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('capacity', 5259, true, '10000')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'powerbank'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === pribor-za-dronove → #2662 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta_opreme', 7308, true, 'Ostalo')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'pribor-za-dronove'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === punjaci-za-telefone → #254 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('connector',           2989, true, 'USB Type C'),
  ('__default_vrsta',      2987, true, 'Strujni (šuko)'),
  ('__default_uticnica',   2986, true, 'EU')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'punjaci-za-telefone-i-tablete'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === tableti → #1495 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('screen_size', 2305, true, '10')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'tableti'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === video-kamere → #273 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_medij', 3581, true, 'Ostalo')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'video-kamere'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;
