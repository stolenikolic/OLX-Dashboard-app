-- Mapiranje svih trenutnih feed kategorija → OLX leaf category_id.
-- procesori (#167) već mapiran u 0002; ovdje ostaje idempotentno.
-- Nove feed kategorije i dalje dolaze sa olx_category_id = null (ručno mapiranje).

update categories c
set
  olx_category_id = m.olx_category_id,
  updated_at = now()
from (values
  -- PC komponente
  ('procesori',                        167),
  ('graficke-kartice',                 154),
  ('maticne-ploce',                    160),
  ('ram',                              161),
  ('ssd',                              155),
  ('hard-diskovi',                    1681),
  ('kucista',                          159),
  ('napajanja',                       1042),
  ('zvucne-kartice',                  1498),
  ('termalne-paste',                  2468),
  ('opticki-uredjaji',                 165),

  -- Hlađenje → Cooleri
  ('vazudsna-hladjenja',               152),
  ('vodena-hladjenja',                 152),
  ('ventilatori-za-kucista',           152),
  ('dodaci-za-vazdusna-hladjenja',     152),
  ('dodaci-za-vodena-hladjenja',       152),

  -- Periferija
  ('monitori',                         163),
  ('misevi',                           162),
  ('tastature',                        170),
  ('set-mis-tastatura',               1521),
  ('podloge-za-mis',                  2148),
  ('slusalice',                       1499),
  ('zvucnici',                        1496),
  ('dodaci-za-miseve',                 894),
  ('dodaci-za-tastature',              894),

  -- Storage / serveri
  ('eksterni-hard-diskovi',            427),
  ('eksterni-ssd',                     427),
  ('serverski-hard-diskovi',          1681),
  ('serverski-ssd-diskovi',            155),
  ('nas-uredjaji',                      75),
  ('serveri',                           75),

  -- Mreža
  ('access-point',                     190),
  ('ruteri',                           194),
  ('switchevi',                       1876),
  ('range-extenderi',                 2114),
  ('repetitori',                      2114),
  ('antene',                           197),
  ('mobilni-modemi',                   892),
  ('pci-pcie-m2-mrezne-kartice',       193),
  ('mesh-sistemi',                     194),
  ('firewall-uredjaji',                198),
  ('gateway-uredjaji',                 198),
  ('mrezni-dodaci',                    198),
  ('mrezni-media-konverteri',          198),
  ('poe-oprema',                       198),
  ('powerline-adapteri',               198),
  ('transceiveri',                     198),
  ('usb-adapteri',                     151),

  -- Kartice / I/O
  ('io-kartice',                       894),
  ('pci-express-kartice',              894),
  ('pci-kartice',                      894),

  -- Tehnika / ured / TV
  ('projektori',                       248),
  ('platna-za-projektore',             248),
  ('dodaci-za-projektore',             248),
  ('stampaci',                         166),
  ('skeneri',                          166),
  ('televizori',                      1748),
  ('set-top-box',                     2096),
  ('profesionalni-displeji',           163),

  -- Sigurnost / VR / tablet / gaming namještaj
  ('nadzorne-kamere',                  816),
  ('sigurnosni-sistemi',               819),
  ('virtuelna-realnost',              2129),
  ('dodaci-za-virtuelnu-realnost',    2129),
  ('digitalne-table',                 2602),
  ('gaming-stolice',                   879),
  ('gaming-stolovi',                   852)
) as m(internal_slug, olx_category_id)
where c.internal_slug = m.internal_slug;
