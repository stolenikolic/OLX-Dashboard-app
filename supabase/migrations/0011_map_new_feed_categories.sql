-- Mapiranje novih feed kategorija (foto/audio/mobilni/gaming) → OLX leaf category_id.
-- Idempotentno: update po internal_slug.

update categories c
set
  olx_category_id = m.olx_category_id,
  updated_at = now()
from (values
  -- Foto / kamere / dronovi
  ('action-kamere',                    2352),
  ('digitalni-fotoaparati',             112),
  ('video-kamere',                      273),
  ('gimbalovi-i-stabilizatori',        1077),
  ('foto-futrole-i-torbe',             1077),
  ('digitalni-okviri-za-slike',         250),
  ('dronovi',                          2115),
  ('pribor-za-dronove',                2662),

  -- Audio / video / radio
  ('bluetooth-zvucnici',               2392),
  ('hi-fi-sistemi',                    2007),
  ('audio-miksete',                    1228),
  ('audio-pojacala',                   1232),
  ('dac-i-audio-konverteri',           2008),
  ('blu-ray-i-dvd-plejeri',            2093),
  ('mp3-plejeri',                        47),
  ('multimedijalni-plejeri',           2096),
  ('radio-uredjaji',                    891),
  ('audio-video-ekstenderi',           1764),

  -- Mobilni uređaji
  ('mobilni-telefoni',                   31),
  ('klasicni-telefoni',                  31),
  ('tableti',                          1495),
  ('pametni-satovi-i-narukvice',       2076),
  ('powerbank',                        2154),
  ('punjaci-za-telefone-i-tablete',     254),
  ('pametni-asistenti',                2543),

  -- Gaming
  ('gaming-konzole',                    292),
  ('igre',                              290),
  ('gaming-kontroleri',                2051),
  ('joystick-i-flight-kontroleri',     2051),
  ('volani-i-simulator-oprema',        2053),
  ('kablovi-i-adapteri',               2054),
  ('futrole-i-zastita',                2059),
  ('drzaci-za-kontrolere',             2052),
  ('ostala-gaming-oprema',             2052),
  ('punjaci-baterije-i-napajanja',     2057),
  ('memorija-i-diskovi',                271)
) as m(internal_slug, olx_category_id)
where c.internal_slug = m.internal_slug;
