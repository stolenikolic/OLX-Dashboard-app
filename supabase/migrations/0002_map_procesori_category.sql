-- Mapiranje: procesori (feed) -> OLX kategorija #167 Procesori
-- Obavezni OLX atribut: socket (#2337)
-- Ostali mapirani: clock_speed, tdp, boxed, cpufamily

update categories
set olx_category_id = 167, updated_at = now()
where internal_slug = 'procesori';

-- attribute_mappings
insert into attribute_mappings (category_id, spec_key, olx_attribute_id, required, fallback_value)
select c.id, m.spec_key, m.olx_attribute_id, m.required, m.fallback_value
from categories c
cross join (values
  ('socket',      2337, true,  'Ostalo'),
  ('clock_speed',  403, false, null),
  ('tdp',         3096, false, null),
  ('boxed',       3091, false, null),
  ('cpufamily',    402, false, null)
) as m(spec_key, olx_attribute_id, required, fallback_value)
where c.internal_slug = 'procesori'
on conflict (category_id, spec_key) do update set
  olx_attribute_id = excluded.olx_attribute_id,
  required = excluded.required,
  fallback_value = excluded.fallback_value;

-- socket: feed vrijednost -> OLX select opcija
insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'procesori'
cross join (values
  ('Socket-AM5',  'Socket AM5'),
  ('Socket-AM4',  'Socket AM4'),
  ('LGA-1700',    'LGA 1700'),
  ('LGA-1200',    'LGA 1200'),
  ('LGA-1851',    'Ostalo'),
  ('Socket-TR5',  'Ostalo'),
  ('Socket-WRX8',  'Ostalo'),
  ('FCLGA3647',   'Ostalo')
) as v(feed_value, olx_value)
where am.spec_key = 'socket'
on conflict (attribute_mapping_id, feed_value) do update set
  olx_value = excluded.olx_value;

-- boxed (feed) -> sa-hladnjakom (OLX checkbox)
insert into attribute_value_mappings (attribute_mapping_id, feed_value, olx_value)
select am.id, v.feed_value, v.olx_value
from attribute_mappings am
join categories c on c.id = am.category_id and c.internal_slug = 'procesori'
cross join (values
  ('Yes', '1'),
  ('No',  '0')
) as v(feed_value, olx_value)
where am.spec_key = 'boxed'
on conflict (attribute_mapping_id, feed_value) do update set
  olx_value = excluded.olx_value;
