-- Seed Sanitary and Fittings sub-categories (idempotent).
-- Safe to re-run; skips rows that already exist by (category, slug).

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others)
SELECT v.category, v.name, v.slug, v.description, v.icon, v.sort_order, v.is_others
FROM (
  VALUES
    ('Sanitary and Fittings', 'Taps & Mixers', 'taps-mixers', 'Basin, kitchen, and shower mixers', '🚰', 1, false),
    ('Sanitary and Fittings', 'Pipes & Connectors', 'pipes-connectors', 'PVC, PPR, elbows, and joints', '🔧', 2, false),
    ('Sanitary and Fittings', 'Bathroom Accessories', 'bathroom-accessories', 'Soap dishes, towel rails, and mirrors', '🪞', 3, false),
    ('Sanitary and Fittings', 'Toilet & Cistern', 'toilet-cistern', 'Commodes, seats, and flush tanks', '🚽', 4, false),
    ('Sanitary and Fittings', 'Showers & Bath', 'showers-bath', 'Shower heads, hand showers, and baths', '🚿', 5, false),
    ('Sanitary and Fittings', 'Valves & Hardware', 'valves-hardware', 'Ball valves, gate valves, and fittings', '⚙️', 6, false),
    ('Sanitary and Fittings', 'Sinks & Basins', 'sinks-basins', 'Wash basins, kitchen sinks, and pedestals', '🧼', 7, false),
    ('Sanitary and Fittings', 'Others', 'others-sanitary-and-fittings', 'Items that do not fit a specific sub-category in Sanitary and Fittings', '📦', 999, true)
) AS v(category, name, slug, description, icon, sort_order, is_others)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sub_categories s
  WHERE s.category = v.category
    AND s.slug = v.slug
);
