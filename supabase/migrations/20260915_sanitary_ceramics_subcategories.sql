-- Enrich Sanitary and Fittings with ceramics, tiles, geysers, sealants (idempotent).

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others)
SELECT v.category, v.name, v.slug, v.description, v.icon, v.sort_order, v.is_others
FROM (
  VALUES
    ('Sanitary and Fittings', 'Taps & Mixers', 'taps-mixers', 'Basin, kitchen, and shower mixers (tootiya)', '🚰', 1, false),
    ('Sanitary and Fittings', 'Ceramics & Chinaware', 'ceramics-chinaware', 'Ceramic wash sets, closets, and china sanitaryware', '🏺', 2, false),
    ('Sanitary and Fittings', 'Toilet & Cistern', 'toilet-cistern', 'Commodes, seats, and flush tanks', '🚽', 3, false),
    ('Sanitary and Fittings', 'Sinks & Basins', 'sinks-basins', 'Wash basins, kitchen sinks, and pedestals', '🧼', 4, false),
    ('Sanitary and Fittings', 'Showers & Bath', 'showers-bath', 'Shower heads, hand showers, and baths', '🚿', 5, false),
    ('Sanitary and Fittings', 'Bathroom Accessories', 'bathroom-accessories', 'Soap dishes, towel rails, mirrors, and holders', '🪞', 6, false),
    ('Sanitary and Fittings', 'Pipes & Connectors', 'pipes-connectors', 'PVC, PPR, elbows, tees, and joints', '🔧', 7, false),
    ('Sanitary and Fittings', 'Valves & Hardware', 'valves-hardware', 'Ball valves, gate valves, and CP fittings', '⚙️', 8, false),
    ('Sanitary and Fittings', 'Tiles & Flooring', 'tiles-flooring', 'Floor tiles, wall tiles, and ceramic tiles', '🧱', 9, false),
    ('Sanitary and Fittings', 'Water Heaters & Geysers', 'water-heaters-geysers', 'Electric / gas geysers and heaters', '♨️', 10, false),
    ('Sanitary and Fittings', 'Sealants & Adhesives', 'sealants-adhesives', 'Silicon, thread tape, glue, and sealants', '🧴', 11, false),
    ('Sanitary and Fittings', 'Others', 'others-sanitary-and-fittings', 'Items that do not fit a specific sub-category in Sanitary and Fittings', '📦', 999, true)
) AS v(category, name, slug, description, icon, sort_order, is_others)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sub_categories s
  WHERE s.category = v.category
    AND s.slug = v.slug
);

-- Keep sort_order / descriptions in sync for existing rows
UPDATE public.sub_categories AS s
SET
  name = v.name,
  description = v.description,
  icon = v.icon,
  sort_order = v.sort_order,
  is_others = v.is_others
FROM (
  VALUES
    ('Sanitary and Fittings', 'taps-mixers', 'Taps & Mixers', 'Basin, kitchen, and shower mixers (tootiya)', '🚰', 1, false),
    ('Sanitary and Fittings', 'ceramics-chinaware', 'Ceramics & Chinaware', 'Ceramic wash sets, closets, and china sanitaryware', '🏺', 2, false),
    ('Sanitary and Fittings', 'toilet-cistern', 'Toilet & Cistern', 'Commodes, seats, and flush tanks', '🚽', 3, false),
    ('Sanitary and Fittings', 'sinks-basins', 'Sinks & Basins', 'Wash basins, kitchen sinks, and pedestals', '🧼', 4, false),
    ('Sanitary and Fittings', 'showers-bath', 'Showers & Bath', 'Shower heads, hand showers, and baths', '🚿', 5, false),
    ('Sanitary and Fittings', 'bathroom-accessories', 'Bathroom Accessories', 'Soap dishes, towel rails, mirrors, and holders', '🪞', 6, false),
    ('Sanitary and Fittings', 'pipes-connectors', 'Pipes & Connectors', 'PVC, PPR, elbows, tees, and joints', '🔧', 7, false),
    ('Sanitary and Fittings', 'valves-hardware', 'Valves & Hardware', 'Ball valves, gate valves, and CP fittings', '⚙️', 8, false),
    ('Sanitary and Fittings', 'tiles-flooring', 'Tiles & Flooring', 'Floor tiles, wall tiles, and ceramic tiles', '🧱', 9, false),
    ('Sanitary and Fittings', 'water-heaters-geysers', 'Water Heaters & Geysers', 'Electric / gas geysers and heaters', '♨️', 10, false),
    ('Sanitary and Fittings', 'sealants-adhesives', 'Sealants & Adhesives', 'Silicon, thread tape, glue, and sealants', '🧴', 11, false)
) AS v(category, slug, name, description, icon, sort_order, is_others)
WHERE s.category = v.category
  AND s.slug = v.slug;
