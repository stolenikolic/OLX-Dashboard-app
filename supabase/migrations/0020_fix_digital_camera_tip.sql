-- OLX kategorija #112 (digitalni-fotoaparati): atribut Tip (#2401)
-- prihvaća samo SLR / DSLR / Ostali. Fallback "Ostalo" je invalidan.

update attribute_mappings am
set fallback_value = 'Ostali'
from categories c
where am.category_id = c.id
  and c.internal_slug = 'digitalni-fotoaparati'
  and am.olx_attribute_id = 2401;
