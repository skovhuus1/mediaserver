-- Apply the Denmark-only initial visibility policy and Canal Digital Denmark's
-- published 20 August 2020 numbering as the stable default order. Admin changes
-- made after this migration remain authoritative.
WITH lineup(position, channel_key, danish) AS (
  VALUES
    (1, 'dr1', true), (2, 'dr2', true), (3, 'tv2', true), (4, 'kanal4', true),
    (5, 'kanal5', true), (6, '6eren', true), (7, 'tv3', true), (8, 'tv3plus', true),
    (9, 'canal9', true), (10, 'eurosport2', false), (11, 'tv2sport', true),
    (12, 'tv2news', true), (13, 'tv2charlie', true), (14, 'tv2fri', true),
    (15, 'dk4', true), (17, 'tv3puls', true), (18, 'tlcdanmark', true),
    (18, 'tlcdenmark', true), (18, 'tlc', true), (19, 'discovery', false),
    (20, 'tv2zulu', true), (21, 'tv2sportx', true), (23, 'tv3max', true),
    (25, 'drramasjang', true), (25, 'ramasjang', true), (26, 'nrk1', false),
    (27, 'svt1', false), (28, 'svt2', false), (29, 'tv4', false),
    (30, 'natgeo', false), (30, 'nationalgeographic', false),
    (31, 'natgeowild', false), (31, 'nationalgeographicwild', false),
    (32, 'animalplanet', false), (33, 'bbcearth', false),
    (34, 'idinvestigationdiscovery', false), (34, 'investigationdiscovery', false),
    (35, 'history', false), (35, 'historychannel', false), (36, 'history2', false),
    (36, 'h2', false), (37, 'vsportultra', false), (38, 'discoveryscience', false),
    (42, 'bbcbrit', false), (44, 'paramountnetwork', false),
    (45, 'mtv', false), (47, 'vh1', false), (48, 'vh1classic', false),
    (60, 'eurosport1', false), (61, 'motorvisiontv', false), (61, 'motorvision', false),
    (63, 'sportlive', true), (64, 'tv3sport', true), (70, 'cnninternational', false),
    (70, 'cnn', false), (71, 'bbcworldnews', false), (71, 'bbcnews', false),
    (72, 'skynews', false), (73, 'bloomberg', false), (74, 'aljazeeraenglish', false),
    (76, 'cnbc', false), (77, 'dwenglish', false), (77, 'deutschewelle', false),
    (80, 'disneychannel', false), (81, 'disneyxd', false), (82, 'disneyjunior', false),
    (83, 'nickelodeon', false), (84, 'nickjr', false), (85, 'cartoonnetwork', false),
    (86, 'boomerang', false), (87, 'nicktoons', false), (100, 'cmorefirst', false),
    (101, 'cmoreseries', false), (102, 'cmorehits', false), (104, 'cmorestars', false),
    (107, 'sfkanalen', false), (110, 'vfilmpremiere', false), (111, 'vfilmaction', false),
    (112, 'vfilmhits', false), (113, 'vfilmfamily', false), (114, 'vseries', false),
    (123, 'netflix', false), (130, 'kanal5undertekster', false), (180, 'visjonnorge', false),
    (181, 'gospelchanneleurope', false), (182, 'cgtn', false), (185, 'kanal10norge', false),
    (186, 'cgtndocumentary', false), (193, 'drp3', true),
    (195, 'scandinaviansatelliteradio', false), (211, 'tv2ost', true),
    (212, 'tv2fyn', true), (213, 'tv2syd', true), (214, 'tv2ostjylland', true),
    (215, 'tv2midtvest', true), (216, 'tv2nord', true), (217, 'tv2bornholm', true)
), normalized AS (
  SELECT
    id,
    number,
    lower(regexp_replace(replace(translate(name, 'ÆØÅæøå', 'AOAaoa'), '+', 'plus'), '[^a-zA-Z0-9]+', '', 'g')) AS raw_key,
    lower(regexp_replace(
      lower(regexp_replace(replace(translate(name, 'ÆØÅæøå', 'AOAaoa'), '+', 'plus'), '[^a-zA-Z0-9]+', '', 'g')),
      '(4k|uhd|2160p|fullhd|fhd|fh|1080p|hd|720p|sd|576p|480p|hevc|h265|h264|dk|danmark|denmark|dansk)+$',
      '', 'g'
    )) AS channel_key,
    lower(coalesce(group_name, '')) AS group_name,
    lower(name) AS source_name
  FROM live_tv_channels
), resolved AS (
  SELECT
    normalized.id,
    normalized.number,
    normalized.group_name,
    normalized.source_name,
    min(lineup.position) AS position,
    coalesce(bool_or(lineup.danish), false) AS danish_lineup
  FROM normalized
  LEFT JOIN lineup ON lineup.channel_key IN (normalized.channel_key, normalized.raw_key)
  GROUP BY normalized.id, normalized.number, normalized.group_name, normalized.source_name
)
UPDATE live_tv_channels AS channel
SET
  enabled = (
    resolved.danish_lineup
    OR resolved.group_name ~ '(^|[^a-z])(dk|dnk|danmark|denmark|dansk|danish)([^a-z]|$)'
    OR resolved.source_name ~ '(^|[^a-z])(dk|dnk|danmark|denmark|dansk|danish)([^a-z]|$)'
  ),
  number = coalesce(resolved.position, channel.number),
  sort_order = coalesce(
    resolved.position * 100,
    90000 + least(coalesce(resolved.number, 9999), 9999)
  )
FROM resolved
WHERE channel.id = resolved.id;
