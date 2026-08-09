-- Local Pakistan retail categories: Grocery, Produce, Bakery, Food, Pharmacy
-- Idempotent seeds for sub_categories (Others + common sub-types).

DO $$
DECLARE
  cat record;
BEGIN
  FOR cat IN
    SELECT unnest(ARRAY[
      'Grocery & Kiryana',
      'Fruits & Vegetables',
      'Bakery & Sweets',
      'Fast Food & Restaurants',
      'Pharmacy & Medical'
    ]) AS category_name
  LOOP
    INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others)
    VALUES (
      cat.category_name,
      'Others / General',
      lower(regexp_replace(cat.category_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-others',
      'Items that do not fit specific sub-categories within ' || cat.category_name,
      '📦',
      999,
      true
    )
    ON CONFLICT (category, slug) DO NOTHING;
  END LOOP;
END $$;

-- Grocery & Kiryana
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Grocery & Kiryana', 'Dry Goods & Spices', 'dry-goods-spices', 'Atta, daal, rice, masala, and pantry staples', '🫙', 1),
  ('Grocery & Kiryana', 'Dairy & Eggs', 'dairy-eggs', 'Milk, yogurt, cheese, and eggs', '🥛', 2),
  ('Grocery & Kiryana', 'Snacks & Beverages', 'snacks-beverages', 'Chips, biscuits, juices, and soft drinks', '🧃', 3),
  ('Grocery & Kiryana', 'Household Essentials', 'household-essentials', 'Cleaning, toiletries, and daily-use items', '🧴', 4),
  ('Grocery & Kiryana', 'Frozen & Packaged', 'frozen-packaged', 'Frozen foods and packaged convenience items', '🧊', 5)
ON CONFLICT (category, slug) DO NOTHING;

-- Fruits & Vegetables
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Fruits & Vegetables', 'Seasonal Fruits', 'seasonal-fruits', 'Fresh seasonal fruit by the kilo', '🍎', 1),
  ('Fruits & Vegetables', 'Fresh Vegetables', 'fresh-vegetables', 'Daily sabzi and leafy greens', '🥦', 2),
  ('Fruits & Vegetables', 'Herbs & Roots', 'herbs-roots', 'Adrak, lehsan, pudina, and kitchen herbs', '🌿', 3),
  ('Fruits & Vegetables', 'Exotic & Imported', 'exotic-imported', 'Imported and specialty produce', '🥑', 4)
ON CONFLICT (category, slug) DO NOTHING;

-- Bakery & Sweets
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Bakery & Sweets', 'Bread & Buns', 'bread-buns', 'Fresh bread, rusk, and bakery buns', '🍞', 1),
  ('Bakery & Sweets', 'Cakes & Pastries', 'cakes-pastries', 'Birthday cakes, cupcakes, and pastries', '🎂', 2),
  ('Bakery & Sweets', 'Mithai & Traditional', 'mithai-traditional', 'Gulab jamun, barfi, jalebi, and mithai boxes', '🍬', 3),
  ('Bakery & Sweets', 'Cookies & Desserts', 'cookies-desserts', 'Cookies, brownies, and sweet treats', '🍪', 4)
ON CONFLICT (category, slug) DO NOTHING;

-- Fast Food & Restaurants
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Fast Food & Restaurants', 'Burgers', 'burgers', 'Burgers, smash burgers, and combo meals', '🍔', 1),
  ('Fast Food & Restaurants', 'Shawarma & Rolls', 'shawarma-rolls', 'Shawarma, wraps, rolls, and sandwiches', '🌯', 2),
  ('Fast Food & Restaurants', 'Deals & Combos', 'deals-combos', 'Family deals, meal boxes, and special offers', '🔥', 3),
  ('Fast Food & Restaurants', 'Desi & BBQ', 'desi-bbq', 'Biryani, karahi, BBQ, and Pakistani classics', '🍖', 4),
  ('Fast Food & Restaurants', 'Pizza & Pasta', 'pizza-pasta', 'Pizza, pasta, and Italian-style meals', '🍕', 5),
  ('Fast Food & Restaurants', 'Fries & Sides', 'fries-sides', 'Fries, nuggets, and side snacks', '🍟', 6),
  ('Fast Food & Restaurants', 'Cafe & Beverages', 'cafe-beverages', 'Coffee, chai, shakes, and soft drinks', '☕', 7),
  ('Fast Food & Restaurants', 'Chinese & Asian', 'chinese-asian', 'Chinese, Thai, and Asian favourites', '🥡', 8)
ON CONFLICT (category, slug) DO NOTHING;

-- Pharmacy & Medical
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Pharmacy & Medical', 'Prescription Medicines', 'prescription-medicines', 'Prescribed medicines and pharmacy counter', '💊', 1),
  ('Pharmacy & Medical', 'OTC & First Aid', 'otc-first-aid', 'Over-the-counter medicines and first-aid', '🩹', 2),
  ('Pharmacy & Medical', 'Personal Care', 'personal-care-medical', 'Hygiene, skincare, and wellness products', '🧴', 3),
  ('Pharmacy & Medical', 'Medical Devices', 'medical-devices', 'BP monitors, thermometers, and devices', '🩺', 4),
  ('Pharmacy & Medical', 'Baby & Mother Care', 'baby-mother-care', 'Infant formula, diapers, and mother care', '🍼', 5)
ON CONFLICT (category, slug) DO NOTHING;
