-- Enrich Fast Food & Restaurants sub-categories (burger, shawarma, deals, etc.)
-- Safe to re-run: ON CONFLICT DO NOTHING

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Fast Food & Restaurants', 'Burgers', 'burgers', 'Burgers, smash burgers, and combo meals', '🍔', 1),
  ('Fast Food & Restaurants', 'Shawarma & Rolls', 'shawarma-rolls', 'Shawarma, wraps, rolls, and sandwiches', '🌯', 2),
  ('Fast Food & Restaurants', 'Deals & Combos', 'deals-combos', 'Family deals, meal boxes, and special offers', '🔥', 3),
  ('Fast Food & Restaurants', 'Desi & BBQ', 'desi-bbq', 'Biryani, karahi, BBQ, and Pakistani classics', '🍖', 4),
  ('Fast Food & Restaurants', 'Pizza & Pasta', 'pizza-pasta', 'Pizza, pasta, and Italian-style meals', '🍕', 5),
  ('Fast Food & Restaurants', 'Fries & Sides', 'fries-sides', 'Fries, nuggets, and side snacks', '🍟', 6),
  ('Fast Food & Restaurants', 'Cafe & Beverages', 'cafe-beverages', 'Coffee, chai, shakes, and soft drinks', '☕', 7),
  ('Fast Food & Restaurants', 'Chinese & Asian', 'chinese-asian', 'Chinese, Thai, and Asian favourites', '🥡', 8),
  ('Fast Food & Restaurants', 'Others / General', 'fast-food-restaurants-others', 'Other food items that do not fit above', '📦', 999)
ON CONFLICT (category, slug) DO NOTHING;

-- Ensure Others flag for the Others row
UPDATE public.sub_categories
SET is_others = true, sort_order = 999
WHERE category = 'Fast Food & Restaurants'
  AND slug = 'fast-food-restaurants-others';
