-- Obogati attribute_mappings feed spec → OLX (faza A+B).
-- Pravilo: svaki required atribut ima fallback_value (rezervni default).

-- ---------------------------------------------------------------------------
-- Helper: obriši stare __default_* ključeve koje zamjenjujemo
-- ---------------------------------------------------------------------------

-- === monitori + profesionalni-displeji → #163 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug in ('monitori', 'profesionalni-displeji')
  and am.spec_key in ('__default_dijagonala', '__default_vrsta');

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('screen_diagonal', 1143, true,  '27'),
  ('panel_type',       369, true,  'IPS'),
  ('resolution',      1164, false, null),
  ('refresh_rate',    5197, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug in ('monitori', 'profesionalni-displeji')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === televizori → #1748 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'televizori'
  and am.spec_key in ('__default_dijagonala', '__default_rezolucija', '__default_tip_teh');

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('screen_diagonal',          3457, true,  '55'),
  ('__derived_tv_resolution',  3459, true,  '4K'),
  ('tv_technology',            7525, true,  'LED LCD'),
  ('hdmi',                     3470, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'televizori'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'televizori'
cross join (values
  ('0', 'Nema'), ('1', '1'), ('2', '2'), ('3', '3'), ('4', '4'), ('Više', '6')
) as v(feed_value, olx_value)
where am.spec_key = 'hdmi'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === ruteri + mesh-sistemi → #194 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug in ('ruteri', 'mesh-sistemi')
  and am.spec_key = '__default_portovi';

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('number_of_lan_ports', 3408, true,  '4'),
  ('wifi_max_speed',      3409, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug in ('ruteri', 'mesh-sistemi')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug in ('ruteri', 'mesh-sistemi')
cross join (values
  ('1','1'),('2','2'),('3','3'),('4','4'),('5','5'),
  ('6','6'),('7','7'),('8','8'),('9','9'),('10','10')
) as v(feed_value, olx_value)
where am.spec_key = 'number_of_lan_ports'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- Broj >10 → Ostalo (transform šalje "11","13",…); mapiraj česte
insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, 'Ostalo'
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug in ('ruteri', 'mesh-sistemi')
cross join (values ('11'),('12'),('13'),('14'),('15'),('16'),('18'),('20'),('24'),('28'),('32'),('48')) as v(feed_value)
where am.spec_key = 'number_of_lan_ports'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === access-point → #190 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'access-point'
  and am.spec_key in ('__default_brzina', '__default_vrsta');

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('wifi_max_speed',           3401, true,  '1200'),
  ('__derived_ap_band',        3402, true,  'Dual band'),
  ('__derived_ap_wifi_standard', 3400, false, null),
  ('poe',                      7643, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'access-point'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, '1', 'PoE'
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'access-point'
where am.spec_key = 'poe'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === switchevi → #1876 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'switchevi'
  and am.spec_key = '__default_portovi';

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('number_of_lan_ports', 3416, true, '8')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'switchevi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === graficke-kartice → #154 (portovi opcionalno) ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('hdmi',         2422, false, null),
  ('displayport',  6877, false, null),
  ('dvi',          2330, false, null),
  ('vgad_sub',     2329, false, null)
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
  ('0', 'Nema'), ('1', '1'), ('2', '2'), ('3', '3'), ('4', '4'), ('Više', 'Više')
) as v(feed_value, olx_value)
where am.spec_key in ('hdmi', 'displayport', 'dvi', 'vgad_sub')
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- GPU memory_size value maps za česte formate
insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'graficke-kartice'
cross join (values
  ('8GB', '8GB'), ('8 GB', '8GB'),
  ('16GB', '16 GB'), ('16 GB', '16 GB'),
  ('12GB', '12 GB'), ('12 GB', '12 GB'),
  ('24GB', '24 GB'), ('24 GB', '24 GB')
) as v(feed_value, olx_value)
where am.spec_key = 'memory_size'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === ssd → #155 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('readspeed',  2314, false, null),
  ('writespeed', 2315, false, null)
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
  ('rpm',       2220, false, null),
  ('size_inch', 5183, false, null),
  ('buffer',    3193, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug in ('hard-diskovi', 'serverski-hard-diskovi')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === napajanja → #1042 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('certificate', 3131, false, null),
  ('modular',     3130, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'napajanja'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'napajanja'
cross join (values
  ('1', '1'),
  ('Da', '1'),
  ('Yes', '1')
) as v(feed_value, olx_value)
where am.spec_key = 'modular'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === tastature → #170 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'tastature'
  and am.spec_key = '__default_prikljucak';

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__derived_keyboard_prikljucak', 2170, true,  'USB'),
  ('mechanical',                    5269, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'tastature'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'tastature'
cross join (values
  ('USB', 'USB'), ('Wireless', 'Wireless'), ('PS/2', 'PS/2'), ('Ostalo', 'Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = '__derived_keyboard_prikljucak'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === set-mis-tastatura → #1521 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'set-mis-tastatura'
  and am.spec_key = '__default_prikljucak';

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__derived_set_prikljucak', 3191, true, 'USB')
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'set-mis-tastatura'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'set-mis-tastatura'
cross join (values
  ('USB', 'USB'), ('Wireless', 'Wireless'), ('PS/2', 'PS/2'), ('Ostalo', 'Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = '__derived_set_prikljucak'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === misevi — sensor opcionalno ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, false, null
from categories c
cross join (values
  ('sensor', 2318)  -- Optički checkbox; value map ispod
) as m(spec_key, olx_attribute_id)
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
  ('Optical', '1'), ('Optički', '1'), ('optical', '1')
) as v(feed_value, olx_value)
where am.spec_key = 'sensor'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === slusalice → wireless opcionalno (vrsta ostaje default) ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, 'wireless', 3180, false, null
from categories c
where c.internal_slug = 'slusalice'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, '1'
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'slusalice'
cross join (values ('1'), ('Da'), ('Yes')) as v(feed_value)
where am.spec_key = 'wireless'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === zvucnici → #1496 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'zvucnici'
  and am.spec_key = '__default_konfig';

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('sound_system', 3164, true,  '2.0'),
  ('sound_power',  3163, false, null),
  ('woofer',       3165, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'zvucnici'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'zvucnici'
cross join (values
  ('2.0','2.0'),('2.1','2.1'),('5.1','5.1'),('6.1','6.1'),('7.1','7.1'),
  ('1.0','Ostalo'),('2.2','2.1'),('Soundbar','Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = 'sound_system'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === stampaci → print tech / wireless ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, false, null
from categories c
cross join (values
  ('print_technology', 4788),
  ('color_printing',   1120),
  ('wifi_connector',   3088)
) as m(spec_key, olx_attribute_id)
where c.internal_slug = 'stampaci'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === nadzorne-kamere → #816 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'nadzorne-kamere'
  and am.spec_key = '__default_rezolucija';

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__derived_camera_resolution', 7445, true,  '1080p'),
  ('wifi',                        7446, false, null),
  ('infra_vision',                7450, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'nadzorne-kamere'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, '1'
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'nadzorne-kamere'
cross join (values ('1'), ('Da'), ('Yes')) as v(feed_value)
where am.spec_key in ('wifi', 'infra_vision')
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === hlađenja — fan_size + vrsta opcionalno; namjena ostaje default ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, false, null
from categories c
cross join (values
  ('fan_size', 2309)
) as m(spec_key, olx_attribute_id)
where c.internal_slug in (
  'vazudsna-hladjenja', 'vodena-hladjenja', 'ventilatori-za-kucista'
)
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- Vrsta hlađenja po slug-u (default mapping key, required=false overlay via dedicated keys)
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, '__default_vrsta_hladjenja', 3058, false, m.fallback_value
from categories c
cross join (values
  ('vazudsna-hladjenja',     'Aktivni'),
  ('vodena-hladjenja',       'Vodeno'),
  ('ventilatori-za-kucista', 'Aktivni')
) as m(slug, fallback_value)
where c.internal_slug = m.slug
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === projektori → #248 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta_projektor', 7521, false, 'Projektori'),
  ('resolution',                2342, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'projektori'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- platna / dodaci — tip oglasa već postoji; dodaj vrstu
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, '__default_vrsta_projektor', 7521, false, 'Platna'
from categories c
where c.internal_slug = 'platna-za-projektore'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, '__default_vrsta_projektor', 7521, false, 'Prezenteri'
from categories c
where c.internal_slug = 'dodaci-za-projektore'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === gaming-stolice → #879 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta_oglasa', 7111, false, 'Prodaja'),
  ('color',                  7976, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'gaming-stolice'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- gaming-stolovi (#852): dimenzije imaju različite select skale (širina vs visina)
-- — namjerno preskočeno da ne šaljemo nevažeće opcije.

-- === podloge-za-mis → #2148 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, 'color', 7960, false, null
from categories c
where c.internal_slug = 'podloge-za-mis'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === eksterni diskovi — capacity + connection ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, false, null
from categories c
cross join (values
  ('capacity',   1158),
  ('connection', 2343)
) as m(spec_key, olx_attribute_id)
where c.internal_slug in ('eksterni-hard-diskovi', 'eksterni-ssd')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug in ('eksterni-hard-diskovi', 'eksterni-ssd')
cross join (values
  ('USB 3.0', 'USB 3.0'), ('USB 3.1', 'USB 3.0'), ('USB 3.2', 'USB 3.0'),
  ('USB 2.0', 'USB 2.0'), ('USB-C', 'Ostalo'), ('USB Type-C', 'Ostalo'),
  ('Thunderbolt', 'Ostalo'), ('USB', 'USB 3.0')
) as v(feed_value, olx_value)
where am.spec_key = 'connection'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === digitalne-table → #2602 ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'digitalne-table'
  and am.spec_key = '__default_ekran';

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('__default_ekran', 6961, true, '10'),
  ('wireless',        6962, false, null),
  ('color',           8004, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'digitalne-table'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'digitalne-table'
cross join (values
  ('1', 'Ostalo'), ('Da', 'Ostalo'), ('Yes', 'Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = 'wireless'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === multimedijalni-plejeri / set-top-box → #2096 ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, false, null
from categories c
cross join (values
  ('support_4k',    5114),
  ('hdmi',          5122),
  ('wifi',          5123),
  ('mobile_app',    5120)
) as m(spec_key, olx_attribute_id)
where c.internal_slug in ('multimedijalni-plejeri', 'set-top-box')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug in ('multimedijalni-plejeri', 'set-top-box')
cross join (values
  ('1', '4K'), ('Da', '4K'), ('Yes', '4K')
) as v(feed_value, olx_value)
where am.spec_key = 'support_4k'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- hdmi/wifi/mobile_app su checkboxi na #2096
insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, '1'
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug in ('multimedijalni-plejeri', 'set-top-box')
cross join (values ('1'), ('Da'), ('Yes'), ('2'), ('3'), ('4'), ('Više')) as v(feed_value)
where am.spec_key in ('hdmi', 'wifi', 'mobile_app')
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === audio-video-ekstenderi → #1764 (required defaults) ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, true, m.fallback_value
from categories c
cross join (values
  ('__default_vrsta',    7530, 'Ostala oprema za TV'),
  ('__default_vrsta_tv', 3424, 'Ostalo')
) as m(spec_key, olx_attribute_id, fallback_value)
where c.internal_slug = 'audio-video-ekstenderi'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === opticki-uredjaji — optical_drive_type umjesto default vrsta ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'opticki-uredjaji'
  and am.spec_key = '__default_vrsta';

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, 'optical_drive_type', 381, true, 'DVD RW'
from categories c
where c.internal_slug = 'opticki-uredjaji'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === zvucne-kartice — connection + audio_channel ===
delete from attribute_mappings am
using categories c
where am.category_id = c.id
  and c.internal_slug = 'zvucne-kartice'
  and am.spec_key = '__default_vrsta';

insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('connection',     3171, true,  'Interna'),
  ('audio_channel',  3173, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'zvucne-kartice'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'zvucne-kartice'
cross join (values
  ('Internal', 'Interna'), ('Interna', 'Interna'), ('PCI', 'Interna'),
  ('PCIe', 'Interna'), ('PCI Express', 'Interna'),
  ('External', 'Eksterna'), ('Eksterna', 'Eksterna'), ('USB', 'Eksterna')
) as v(feed_value, olx_value)
where am.spec_key = 'connection'
on conflict (attribute_mapping_id, feed_value) do update set olx_value = excluded.olx_value;

-- === maticne — SATA + RAM tip opcionalno ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, false, null
from categories c
cross join (values
  ('sata3_connector',         2317),
  ('__derived_mb_memory_type', 3073)
) as m(spec_key, olx_attribute_id)
where c.internal_slug = 'maticne-ploce'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- === usb-adapteri / pci mrezne — brzina opcionalno ===
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, 'wifi_max_speed', 446, false, null
from categories c
where c.internal_slug in ('usb-adapteri', 'pci-pcie-m2-mrezne-kartice')
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- Garantuj: svi required mappingi imaju fallback
update attribute_mappings
set fallback_value = coalesce(nullif(trim(fallback_value), ''), 'Ostalo')
where required = true
  and (fallback_value is null or trim(fallback_value) = '');
