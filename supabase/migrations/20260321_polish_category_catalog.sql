-- TrendsMart: polish category catalog (Cafe, Meat, expanded subs)
-- Safe to re-run: ON CONFLICT DO UPDATE
BEGIN;

DO $$
DECLARE cat record;
BEGIN
  FOR cat IN
    SELECT DISTINCT category AS category_name FROM (VALUES
      ('Grocery & Kiryana'),
      ('Fruits & Vegetables'),
      ('Meat & Seafood'),
      ('Bakery & Sweets'),
      ('Fast Food & Restaurants'),
      ('Cafe & Beverages'),
      ('Pharmacy & Medical'),
      ('Fashion & Apparel'),
      ('Electronics & Gadgets'),
      ('Home & Living'),
      ('Health & Beauty'),
      ('Books & Stationery'),
      ('Sports & Fitness'),
      ('Toys & Baby Care'),
      ('Automotive Accessories'),
      ('Handmade & Crafts'),
      ('Home Maintenance & Repair'),
      ('Security & Surveillance'),
      ('Tech & IT Services'),
      ('Personal & Professional Services'),
      ('Others / Universal')
    ) AS t(category)
  LOOP
    INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others)
    VALUES (
      cat.category_name,
      'Others / General',
      lower(regexp_replace(cat.category_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-others',
      'Items that do not fit specific sub-categories within ' || cat.category_name,
      '📦', 999, true
    )
    ON CONFLICT (category, slug) DO NOTHING;
  END LOOP;
END $$;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Grocery & Kiryana', 'Dry Goods & Spices', 'dry-goods-spices', 'Atta, daal, rice, masala, and pantry staples', '🫙', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Grocery & Kiryana', 'Oil, Ghee & Butter', 'oil-ghee-butter', 'Cooking oil, desi ghee, and spreads', '🫒', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Grocery & Kiryana', 'Dairy & Eggs', 'dairy-eggs', 'Milk, yogurt, cheese, and eggs', '🥛', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Grocery & Kiryana', 'Tea, Coffee & Breakfast', 'tea-coffee-breakfast', 'Chai, coffee, cereals, and breakfast items', '☕', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Grocery & Kiryana', 'Snacks & Beverages', 'snacks-beverages', 'Chips, biscuits, juices, and soft drinks', '🧃', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Grocery & Kiryana', 'Household Essentials', 'household-essentials', 'Cleaning, toiletries, and daily-use items', '🧴', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Grocery & Kiryana', 'Frozen & Packaged', 'frozen-packaged', 'Frozen foods and packaged convenience items', '🧊', 7, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Grocery & Kiryana', 'Baby & Pet Food', 'baby-pet-food', 'Formula, baby food, and pet groceries', '🍼', 8, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fruits & Vegetables', 'Seasonal Fruits', 'seasonal-fruits', 'Fresh seasonal fruit by the kilo', '🍎', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fruits & Vegetables', 'Fresh Vegetables', 'fresh-vegetables', 'Daily sabzi and leafy greens', '🥦', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fruits & Vegetables', 'Herbs & Roots', 'herbs-roots', 'Adrak, lehsan, pudina, and kitchen herbs', '🌿', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fruits & Vegetables', 'Exotic & Imported', 'exotic-imported', 'Imported and specialty produce', '🥑', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fruits & Vegetables', 'Cut & Ready Packs', 'cut-ready-packs', 'Peeled, cut, and ready-to-cook packs', '🥗', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Meat & Seafood', 'Chicken', 'chicken', 'Fresh and cut chicken', '🍗', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Meat & Seafood', 'Mutton & Beef', 'mutton-beef', 'Mutton, beef, and goat cuts', '🥩', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Meat & Seafood', 'Fish & Seafood', 'fish-seafood', 'Fish, prawns, and seafood', '🐟', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Meat & Seafood', 'Frozen Meat', 'frozen-meat', 'Frozen meat packs and kebabs', '🧊', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Meat & Seafood', 'Marinated & Ready', 'marinated-ready', 'Marinated tikka, boti, and BBQ packs', '🔥', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Bakery & Sweets', 'Bread & Buns', 'bread-buns', 'Fresh bread, rusk, and bakery buns', '🍞', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Bakery & Sweets', 'Cakes & Pastries', 'cakes-pastries', 'Birthday cakes, cupcakes, and pastries', '🎂', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Bakery & Sweets', 'Mithai & Traditional', 'mithai-traditional', 'Gulab jamun, barfi, jalebi, and mithai boxes', '🍬', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Bakery & Sweets', 'Cookies & Desserts', 'cookies-desserts', 'Cookies, brownies, and sweet treats', '🍪', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Bakery & Sweets', 'Savory Bakery', 'savory-bakery', 'Patties, samosas, and savory bakery', '🥐', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fast Food & Restaurants', 'Burgers', 'burgers', 'Burgers, smash burgers, and combo meals', '🍔', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fast Food & Restaurants', 'Shawarma & Rolls', 'shawarma-rolls', 'Shawarma, wraps, rolls, and sandwiches', '🌯', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fast Food & Restaurants', 'Pizza & Pasta', 'pizza-pasta', 'Pizza, pasta, and Italian-style meals', '🍕', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fast Food & Restaurants', 'Desi & BBQ', 'desi-bbq', 'Biryani, karahi, BBQ, and Pakistani classics', '🍖', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fast Food & Restaurants', 'Chinese & Asian', 'chinese-asian', 'Chinese, Thai, and Asian favourites', '🥡', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fast Food & Restaurants', 'Fries & Sides', 'fries-sides', 'Fries, nuggets, and side snacks', '🍟', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fast Food & Restaurants', 'Breakfast & Paratha', 'breakfast-paratha', 'Paratha, omelette, and breakfast plates', '🍳', 7, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fast Food & Restaurants', 'Deals & Combos', 'deals-combos', 'Family deals, meal boxes, and special offers', '🔥', 8, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fast Food & Restaurants', 'Desserts & Ice Cream', 'desserts-ice-cream', 'Ice cream, kulfi, and sweet endings', '🍨', 9, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Cafe & Beverages', 'Coffee & Espresso', 'coffee-espresso', 'Coffee, latte, cappuccino, and espresso', '☕', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Cafe & Beverages', 'Chai & Desi Drinks', 'chai-desi-drinks', 'Chai, doodh patti, and desi beverages', '🫖', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Cafe & Beverages', 'Fresh Juices & Shakes', 'juices-shakes', 'Fresh juices, smoothies, and milkshakes', '🥤', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Cafe & Beverages', 'Mocktails & Cold Drinks', 'mocktails-cold', 'Mocktails, iced drinks, and sodas', '🍹', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Cafe & Beverages', 'Snacks & Light Bites', 'cafe-snacks', 'Sandwiches, wraps, and cafe snacks', '🥪', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Cafe & Beverages', 'Desserts & Bakery Cafe', 'cafe-desserts', 'Cakes, brownies, and cafe desserts', '🍰', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Pharmacy & Medical', 'Prescription Medicines', 'prescription-medicines', 'Prescribed medicines and pharmacy counter', '💊', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Pharmacy & Medical', 'OTC & First Aid', 'otc-first-aid', 'Over-the-counter medicines and first-aid', '🩹', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Pharmacy & Medical', 'Personal Care', 'personal-care-medical', 'Hygiene, skincare, and wellness products', '🧴', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Pharmacy & Medical', 'Vitamins & Supplements', 'vitamins-supplements', 'Multivitamins, calcium, and wellness packs', '💊', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Pharmacy & Medical', 'Medical Devices', 'medical-devices', 'BP monitors, thermometers, and devices', '🩺', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Pharmacy & Medical', 'Baby & Mother Care', 'baby-mother-care', 'Infant formula, diapers, and mother care', '🍼', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fashion & Apparel', 'Women''s Clothing', 'womens-clothing', 'Dresses, tops, kurtis, and casual wear', '👗', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fashion & Apparel', 'Men''s Clothing', 'mens-clothing', 'Shalwar kameez, shirts, trousers, and suits', '👔', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fashion & Apparel', 'Kids'' Wear', 'kids-wear', 'Children''s clothing, uniforms, and accessories', '👶', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fashion & Apparel', 'Unstitched & Lawn', 'unstitched-lawn', 'Lawn, unstitched suits, and fabric', '🧵', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fashion & Apparel', 'Footwear', 'footwear', 'Shoes, sandals, sneakers, and formal wear', '👟', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fashion & Apparel', 'Accessories', 'accessories', 'Bags, watches, jewelry, and sunglasses', '👜', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fashion & Apparel', 'Winter Collection', 'winter-collection', 'Sweaters, jackets, shawls, and warm wear', '🧥', 7, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Fashion & Apparel', 'Wedding & Formal', 'wedding-formal', 'Bridal wear, sherwani, and formal suits', '💍', 8, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Electronics & Gadgets', 'Smartphones', 'smartphones', 'Mobile phones and handsets', '📱', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Electronics & Gadgets', 'Mobile Accessories', 'mobile-accessories', 'Cases, screen guards, earphones, and stands', '🎧', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Electronics & Gadgets', 'Laptops & Computers', 'laptops-computers', 'Notebooks, desktops, and peripherals', '💻', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Electronics & Gadgets', 'Audio & Headphones', 'audio-headphones', 'Speakers, earphones, headphones, and audio gear', '🔊', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Electronics & Gadgets', 'Chargers & Power', 'chargers-power', 'Power banks, chargers, cables, and adapters', '🔌', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Electronics & Gadgets', 'Smart Home & Wearables', 'smart-home-wearables', 'Smart watches, bands, and IoT gadgets', '⌚', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Electronics & Gadgets', 'Home Appliances', 'home-appliances', 'Irons, blenders, fans, and small appliances', '🏠', 7, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home & Living', 'Furniture', 'furniture', 'Beds, sofas, tables, chairs, and storage', '🛋️', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home & Living', 'Kitchen & Dining', 'kitchen-dining', 'Cookware, utensils, dinner sets, and glassware', '🍽️', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home & Living', 'Home Décor', 'home-decor', 'Vases, wall art, clocks, mirrors, and candles', '🖼️', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home & Living', 'Bedding & Linens', 'bedding-linens', 'Bed sheets, pillows, blankets, and towels', '🛏️', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home & Living', 'Lighting', 'lighting', 'Lamps, bulbs, and decorative lights', '💡', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home & Living', 'Storage & Organizers', 'storage-organizers', 'Racks, boxes, and home organizers', '📦', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home & Living', 'Cleaning & Supplies', 'cleaning-supplies', 'Cleaning tools, detergents, and supplies', '🧹', 7, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Health & Beauty', 'Skincare', 'skincare', 'Creams, serums, sunscreens, and face masks', '🧴', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Health & Beauty', 'Makeup', 'makeup', 'Lipsticks, foundations, eyeshadows, and palettes', '💄', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Health & Beauty', 'Hair Care', 'hair-care', 'Shampoos, conditioners, oils, and styling', '💇', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Health & Beauty', 'Fragrances & Attar', 'fragrances-attar', 'Perfumes, attars, and body sprays', '🌸', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Health & Beauty', 'Personal Care', 'personal-care', 'Soaps, lotions, oral care, and hygiene', '🧼', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Health & Beauty', 'Men''s Grooming', 'mens-grooming', 'Beard care, shaving, and men''s kits', '🧔', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Books & Stationery', 'Fiction & Novels', 'fiction-novels', 'Novels, literature, and fiction books', '📖', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Books & Stationery', 'Educational & Exam', 'educational-exam', 'Textbooks, guides, and exam prep', '📚', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Books & Stationery', 'Islamic & Religious', 'islamic-religious', 'Quran, Islamic books, and religious literature', '☪️', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Books & Stationery', 'Stationery & Office', 'stationery-office', 'Pens, notebooks, and office essentials', '✏️', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Books & Stationery', 'Art & Craft Supplies', 'art-craft-supplies', 'Colors, brushes, and craft kits', '🎨', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Sports & Fitness', 'Exercise Equipment', 'exercise-equipment', 'Dumbbells, mats, and home gym gear', '🏋️', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Sports & Fitness', 'Sportswear', 'sportswear', 'Activewear, tracksuits, and sports shoes', '👟', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Sports & Fitness', 'Outdoor & Adventure', 'outdoor-adventure', 'Camping, hiking, and cycling gear', '⛺', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Sports & Fitness', 'Team Sports', 'team-sports', 'Cricket, football, and team gear', '🏏', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Sports & Fitness', 'Supplements', 'supplements', 'Protein, vitamins, and nutrition', '🥤', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Toys & Baby Care', 'Toys & Games', 'toys-games', 'Toys, puzzles, and board games', '🧸', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Toys & Baby Care', 'Baby Gear', 'baby-gear', 'Strollers, carriers, and baby furniture', '👶', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Toys & Baby Care', 'Baby Clothing', 'baby-clothing', 'Onesies, bibs, and infant wear', '🍼', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Toys & Baby Care', 'Diapers & Wipes', 'diapers-wipes', 'Diapers, wipes, and changing essentials', '🧷', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Toys & Baby Care', 'Feeding & Nursing', 'feeding-nursing', 'Bottles, sterilizers, and feeding sets', '🍼', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Automotive Accessories', 'Car Electronics', 'car-electronics', 'Stereos, dashcams, and GPS', '📻', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Automotive Accessories', 'Car Care', 'car-care', 'Cleaning kits, waxes, and fresheners', '🧽', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Automotive Accessories', 'Interior Accessories', 'interior-accessories', 'Seat covers, mats, and organizers', '💺', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Automotive Accessories', 'Exterior & Parts', 'exterior-parts', 'Lights, mirrors, and body accessories', '🔧', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Automotive Accessories', 'Motorcycle Accessories', 'motorcycle-accessories', 'Helmets, gloves, and bike covers', '🏍️', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Automotive Accessories', 'Oils & Fluids', 'oils-fluids', 'Engine oil, coolants, and fluids', '🛢️', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Handmade & Crafts', 'Home Decor Crafts', 'home-decor-crafts', 'Handmade décor and wall pieces', '🖼️', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Handmade & Crafts', 'Jewelry & Beads', 'jewelry-beads', 'Handmade jewelry and beadwork', '📿', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Handmade & Crafts', 'Custom Gifts', 'custom-gifts', 'Personalized and gift crafts', '🎁', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Handmade & Crafts', 'Art & Paintings', 'art-paintings', 'Paintings, calligraphy, and art', '🎨', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Handmade & Crafts', 'Resin & Clay', 'resin-clay', 'Resin art, clay crafts, and keychains', '🪨', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home Maintenance & Repair', 'Plumbing', 'plumbing', 'Plumbers and water-line repair', '🔧', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home Maintenance & Repair', 'Electrical', 'electrical', 'Electricians and wiring work', '⚡', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home Maintenance & Repair', 'AC & Cooling', 'ac-cooling', 'AC install, gas, and repair', '❄️', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home Maintenance & Repair', 'Carpentry', 'carpentry', 'Woodwork and furniture repair', '🪚', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home Maintenance & Repair', 'Painting & Polish', 'painting-polish', 'Painting, polish, and finishing', '🖌️', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Home Maintenance & Repair', 'Appliance Repair', 'appliance-repair', 'Fridge, washing machine, and appliance fix', '🛠️', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Security & Surveillance', 'CCTV Cameras', 'cctv-cameras', 'CCTV cameras and kits', '📹', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Security & Surveillance', 'Installation & Setup', 'installation-setup', 'On-site CCTV and alarm installation', '🛠️', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Security & Surveillance', 'Alarms & Sensors', 'alarms-sensors', 'Burglar alarms and motion sensors', '🚨', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Security & Surveillance', 'Access Control', 'access-control', 'Biometric and door access systems', '🔐', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Security & Surveillance', 'DVR / NVR & Storage', 'dvr-nvr-storage', 'Recorders, hard disks, and storage', '💾', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Tech & IT Services', 'Laptop & PC Repair', 'laptop-pc-repair', 'Laptop and desktop repair', '💻', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Tech & IT Services', 'Mobile Repair', 'mobile-repair', 'Phone screen, battery, and software', '📱', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Tech & IT Services', 'Networking & Wi‑Fi', 'networking-wifi', 'Routers, LAN, and Wi‑Fi setup', '📶', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Tech & IT Services', 'Software & Web', 'software-web', 'Software install, websites, and apps', '🌐', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Tech & IT Services', 'Data Recovery', 'data-recovery', 'Recover files from drives and phones', '💽', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Tech & IT Services', 'IT Support & Training', 'it-support-training', 'On-call IT support and basic training', '🧑‍💻', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Personal & Professional Services', 'Salon & Beauty', 'salon-beauty', 'Hair, makeup, and beauty services', '💇', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Personal & Professional Services', 'Spa & Wellness', 'spa-wellness', 'Massage, spa, and wellness', '🧘', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Personal & Professional Services', 'Tutoring & Coaching', 'tutoring-coaching', 'Home tuition and exam coaching', '📘', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Personal & Professional Services', 'Cleaning & Maid', 'cleaning-maid', 'Home cleaning and maid services', '🧹', 4, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Personal & Professional Services', 'Events & Photography', 'events-photography', 'Events, photography, and videography', '📸', 5, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Personal & Professional Services', 'Legal & Accounting', 'legal-accounting', 'Legal advice and accounting help', '⚖️', 6, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Personal & Professional Services', 'Printing & Documents', 'printing-documents', 'Photocopy, printing, and documents', '🖨️', 7, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Others / Universal', 'General Merchandise', 'general-merchandise', 'Mixed everyday products', '📦', 1, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Others / Universal', 'Gifts & Party', 'gifts-party', 'Gifts, balloons, and party supplies', '🎈', 2, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others) VALUES
  ('Others / Universal', 'Multi-Category Store', 'multi-category-store', 'Stores selling across categories', '🏪', 3, false)
ON CONFLICT (category, slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

COMMIT;