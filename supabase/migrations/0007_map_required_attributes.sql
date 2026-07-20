-- Mapiranje obaveznih OLX atributa za sve feed kategorije (osim procesori — već u 0002).
-- serveri: is_postable = false (feed šum).

-- ---------------------------------------------------------------------------
-- Policy
-- ---------------------------------------------------------------------------
update categories
set is_postable = false, updated_at = now()
where internal_slug = 'serveri';

-- ---------------------------------------------------------------------------
-- Helper: upsert attribute_mappings for a slug
-- Pattern: insert … select from categories cross join values … on conflict
-- ---------------------------------------------------------------------------

-- === graficke-kartice → #154 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_port', 1745, true,  'PCI E x16 4.0'),
  ('memory_size',    1740, true,  '8GB'),
  ('memory_type',    1741, true,  'GDDR6'),
  ('__default_bus',  3885, true,  '128')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'graficke-kartice'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'graficke-kartice'
cross join (values
  ('GDDR5',  'GDDR5'),
  ('GDDR6',  'GDDR6'),
  ('GDDR6X', 'GDDR6X'),
  ('GDDR7',  'GDDR7'),
  ('GDDR3',  'GDDR3'),
  ('GDDR4',  'GDDR4')
) as v(feed_value, olx_value)
where am.spec_key = 'memory_type'
on conflict (attribute_mapping_id, feed_value) do update set
  olx_value = excluded.olx_value;

-- === maticne-ploce → #160 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('memory_sockets',     3074, true,  '4'),
  ('__default_pci',      2209, true,  'PCI E x16'),
  ('__derived_procesor', 3071, true,  'Ostalo'),
  ('socket',             2060, true,  'Ostalo'),
  ('__default_vrsta',    4786, true,  'Desktop PC')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'maticne-ploce'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'maticne-ploce'
cross join (values
  ('Socket-AM5',  'Socket AM5'),
  ('Socket-AM4',  'Socket AM4'),
  ('LGA-1700',    'LGA 1700'),
  ('LGA-1200',    'LGA 1200'),
  ('LGA-1851',    'Ostalo'),
  ('Socket-TR5',  'Ostalo'),
  ('Socket-WRX8', 'Ostalo'),
  ('FCLGA3647',   'Ostalo'),
  ('LGA-1151',    'LGA 1151'),
  ('LGA-1150',    'LGA 1150'),
  ('LGA-1155',    'LGA 1155/Socket H2'),
  ('Socket-AM3+', 'Socket AM3+'),
  ('Socket-AM1',  'Socket AM1')
) as v(feed_value, olx_value)
where am.spec_key = 'socket'
on conflict (attribute_mapping_id, feed_value) do update set
  olx_value = excluded.olx_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'maticne-ploce'
cross join (values
  ('AMD',   'AMD'),
  ('Intel', 'Intel'),
  ('Ostalo','Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = '__derived_procesor'
on conflict (attribute_mapping_id, feed_value) do update set
  olx_value = excluded.olx_value;

-- === ram → #161 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__derived_ram_quantity', 3077, true,  '8 GB'),
  ('memory_type',            2071, true,  'DDR4'),
  ('__derived_ram_vrsta',    2437, true,  'Desktop PC')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'ram'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'ram'
cross join (values
  ('DDR3',                     'DDR3'),
  ('DDR4',                     'DDR4'),
  ('DDR5',                     'DDR5'),
  ('DDR5/CUDIMM',              'DDR5'),
  ('DDR',                      'DDR'),
  ('DDR2',                     'DDR2'),
  ('Notebook DDR3 (SO-DIMM)',  'DDR3'),
  ('Notebook DDR4 (SO-DIMM)',  'DDR4'),
  ('Notebook DDR5 (SO-DIMM)',  'DDR5')
) as v(feed_value, olx_value)
where am.spec_key = 'memory_type'
on conflict (attribute_mapping_id, feed_value) do update set
  olx_value = excluded.olx_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'ram'
cross join (values
  ('Desktop PC', 'Desktop PC'),
  ('Laptop',     'Laptop'),
  ('Server',     'Server'),
  ('Ostalo',     'Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = '__derived_ram_vrsta'
on conflict (attribute_mapping_id, feed_value) do update set
  olx_value = excluded.olx_value;

-- === ssd + serverski-ssd-diskovi → #155 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('capacity', 320, true, '512')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug in ('ssd', 'serverski-ssd-diskovi')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === hard-diskovi → #1681 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('capacity',             2219, true, '1000'),
  ('__default_prikljucak', 3192, true, 'SATA III'),
  ('__default_vrsta',      2221, true, 'Desktop')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'hard-diskovi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === serverski-hard-diskovi → #1681 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('capacity',             2219, true, '1000'),
  ('__default_prikljucak', 3192, true, 'SAS'),
  ('__default_vrsta',      2221, true, 'Ostalo')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'serverski-hard-diskovi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === kucista → #159 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('size_standard', 2316, true, 'Midi ATX')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'kucista'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'kucista'
cross join (values
  ('ATX',                    'Full ATX'),
  ('Midi ATX',               'Midi ATX'),
  ('Micro ATX',              'Micro ATX'),
  ('Mini ITX',               'Ostalo'),
  ('EATX',                   'Full ATX'),
  ('EATX rear connection',   'Full ATX'),
  ('Mini-ITX',               'Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = 'size_standard'
on conflict (attribute_mapping_id, feed_value) do update set
  olx_value = excluded.olx_value;

-- === napajanja → #1042 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('output_performance', 3126, true, '650')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'napajanja'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === zvucne-kartice → #1498 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta', 3171, true, 'Interna')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'zvucne-kartice'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === opticki-uredjaji → #165 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta', 381,  true, 'DVD RW'),
  ('__default_za',    2062, true, 'Eksterni')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'opticki-uredjaji'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === Hlađenje → #152 (namjena) ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, '__default_namjena', 3057, true, m.fallback_value
from categories c
cross join (values
  ('vazudsna-hladjenja',              'Za procesor'),
  ('vodena-hladjenja',                'Za procesor'),
  ('ventilatori-za-kucista',          'Za kuciste'),
  ('dodaci-za-vazdusna-hladjenja',    'Ostalo'),
  ('dodaci-za-vodena-hladjenja',      'Ostalo')
) as m(slug, fallback_value)
where c.internal_slug = m.slug
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === monitori + profesionalni-displeji → #163 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_dijagonala', 1143, true, '27'),
  ('__default_vrsta',       369, true, 'IPS')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug in ('monitori', 'profesionalni-displeji')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === misevi → #162 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__derived_prikljucak', 2339, true, 'USB')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'misevi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'misevi'
cross join (values
  ('USB',                 'USB'),
  ('Wireless (bežični)',  'Wireless (bežični)'),
  ('PS/2',                'PS/2'),
  ('Ostalo',              'Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = '__derived_prikljucak'
on conflict (attribute_mapping_id, feed_value) do update set
  olx_value = excluded.olx_value;

-- === tastature → #170 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_prikljucak', 2170, true, 'USB')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'tastature'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === set-mis-tastatura → #1521 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_prikljucak', 3191, true, 'USB')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'set-mis-tastatura'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === slusalice → #1499 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta', 3178, true, 'Oko uha')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'slusalice'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === zvucnici → #1496 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_konfig', 3164, true, '2.0')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'zvucnici'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === eksterni-hard-diskovi → #427 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta', 1157, true, 'Hard Disk')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'eksterni-hard-diskovi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === eksterni-ssd → #427 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta', 1157, true, 'Ostalo')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'eksterni-ssd'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === nas-uredjaji → #75 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_os',       475,  true, 'Ostalo'),
  ('__default_procesor', 3418, true, 'Ostalo'),
  ('__default_disk',     3421, true, 'do 1'),
  ('__default_ram',      3420, true, 'Do 2')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'nas-uredjaji'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === access-point → #190 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta',  3402, true, 'Dual band'),
  ('__default_brzina', 3401, true, '1200')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'access-point'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === ruteri + mesh-sistemi → #194 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_portovi', 3408, true, '4')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug in ('ruteri', 'mesh-sistemi')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === switchevi → #1876 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_portovi', 3416, true, '8')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'switchevi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === mobilni-modemi → #892 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta', 2345, true, 'Ostalo')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'mobilni-modemi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === pci-pcie-m2-mrezne-kartice → #193 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta', 3403, true, 'Interna')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'pci-pcie-m2-mrezne-kartice'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === usb-adapteri → #151 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_za', 2063, true, 'Desktop')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'usb-adapteri'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === projektori / platna / dodaci → #248 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta_oglasa', 7126, true, 'Prodaja')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug in ('projektori', 'platna-za-projektore', 'dodaci-za-projektore')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === stampaci → #166 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_tip', 7522, true, 'Printer')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'stampaci'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === skeneri → #166 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_tip', 7522, true, 'Skener')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'skeneri'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === televizori → #1748 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_tip_teh',    7525, true, 'LED LCD'),
  ('__default_dijagonala', 3457, true, '55'),
  ('__default_rezolucija', 3459, true, '4K')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'televizori'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === nadzorne-kamere → #816 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_rezolucija', 7445, true, '1080p')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'nadzorne-kamere'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === digitalne-table → #2602 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_ekran', 6961, true, '10')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'digitalne-table'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;
