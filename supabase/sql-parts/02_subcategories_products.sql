-- TrendMart SQL part file — run in order in Supabase SQL Editor
-- If 'Failed to fetch (api.supabase.com)' appears: wait 10s, re-run THIS part only, or try another browser / disable VPN.

-- #############################################################################
-- PART 2 — SUB-CATEGORIES + PRODUCT MARKDOWN-PRICING / GALLERY ENHANCEMENTS
-- #############################################################################

BEGIN;

-- Canonical markdown-pricing field used by lib/formatters.ts::getProductDiscount().
-- (compare_at_price, added further below, is kept only as a legacy fallback.)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS original_price numeric(10,2) DEFAULT NULL;

-- ── 1. Sub-Categories Table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sub_categories (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category        text NOT NULL,               -- Parent main category (matches shops.category)
  name            text NOT NULL,               -- Sub-category display name
  slug            text NOT NULL,               -- URL-friendly slug
  description     text DEFAULT '',             -- Optional description
  icon            text DEFAULT '📦',           -- Emoji icon
  is_active       boolean DEFAULT true,        -- Enable/disable toggle
  sort_order      integer DEFAULT 0,           -- Display ordering
  is_others       boolean DEFAULT false,       -- Flag: this is the 'Others' fallback entry
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  -- Each category must have exactly one 'Others' entry (enforced by app logic + partial unique)
  CONSTRAINT sub_categories_category_slug_unique UNIQUE (category, slug)
);

-- Safety net: backfill any columns missing from an older/partial "sub_categories" table.
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS description text DEFAULT '';
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS icon text DEFAULT '📦';
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS is_others boolean DEFAULT false;
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.sub_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


-- Index for fast lookup by category
CREATE INDEX IF NOT EXISTS idx_sub_categories_category ON public.sub_categories(category, sort_order);

-- ── 2. Seed sub-categories with 'Others' for all main categories ─────────────
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
      'Pharmacy & Medical',
      'Fashion & Apparel',
      'Electronics & Gadgets',
      'Home & Living',
      'Health & Beauty',
      'Books & Stationery',
      'Sports & Fitness',
      'Toys & Baby Care',
      'Automotive Accessories',
      'Handmade & Crafts',
      'Home Maintenance & Repair',
      'Security & Surveillance',
      'Tech & IT Services',
      'Personal & Professional Services',
      'Others / Universal'
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

-- ── 3. Seed meaningful sub-categories for key categories ────────────────────

-- Local retail (Pakistan)
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Grocery & Kiryana', 'Dry Goods & Spices', 'dry-goods-spices', 'Atta, daal, rice, masala, and pantry staples', '🫙', 1),
  ('Grocery & Kiryana', 'Dairy & Eggs', 'dairy-eggs', 'Milk, yogurt, cheese, and eggs', '🥛', 2),
  ('Grocery & Kiryana', 'Snacks & Beverages', 'snacks-beverages', 'Chips, biscuits, juices, and soft drinks', '🧃', 3),
  ('Grocery & Kiryana', 'Household Essentials', 'household-essentials', 'Cleaning, toiletries, and daily-use items', '🧴', 4),
  ('Grocery & Kiryana', 'Frozen & Packaged', 'frozen-packaged', 'Frozen foods and packaged convenience items', '🧊', 5)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Fruits & Vegetables', 'Seasonal Fruits', 'seasonal-fruits', 'Fresh seasonal fruit by the kilo', '🍎', 1),
  ('Fruits & Vegetables', 'Fresh Vegetables', 'fresh-vegetables', 'Daily sabzi and leafy greens', '🥦', 2),
  ('Fruits & Vegetables', 'Herbs & Roots', 'herbs-roots', 'Adrak, lehsan, pudina, and kitchen herbs', '🌿', 3),
  ('Fruits & Vegetables', 'Exotic & Imported', 'exotic-imported', 'Imported and specialty produce', '🥑', 4)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Bakery & Sweets', 'Bread & Buns', 'bread-buns', 'Fresh bread, rusk, and bakery buns', '🍞', 1),
  ('Bakery & Sweets', 'Cakes & Pastries', 'cakes-pastries', 'Birthday cakes, cupcakes, and pastries', '🎂', 2),
  ('Bakery & Sweets', 'Mithai & Traditional', 'mithai-traditional', 'Gulab jamun, barfi, jalebi, and mithai boxes', '🍬', 3),
  ('Bakery & Sweets', 'Cookies & Desserts', 'cookies-desserts', 'Cookies, brownies, and sweet treats', '🍪', 4)
ON CONFLICT (category, slug) DO NOTHING;

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

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Pharmacy & Medical', 'Prescription Medicines', 'prescription-medicines', 'Prescribed medicines and pharmacy counter', '💊', 1),
  ('Pharmacy & Medical', 'OTC & First Aid', 'otc-first-aid', 'Over-the-counter medicines and first-aid', '🩹', 2),
  ('Pharmacy & Medical', 'Personal Care', 'personal-care-medical', 'Hygiene, skincare, and wellness products', '🧴', 3),
  ('Pharmacy & Medical', 'Medical Devices', 'medical-devices', 'BP monitors, thermometers, and devices', '🩺', 4),
  ('Pharmacy & Medical', 'Baby & Mother Care', 'baby-mother-care', 'Infant formula, diapers, and mother care', '🍼', 5)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Fashion & Apparel', 'Women''s Clothing', 'womens-clothing', 'Dresses, tops, kurtis, and casual wear', '👗', 1),
  ('Fashion & Apparel', 'Men''s Clothing', 'mens-clothing', 'Shalwar kameez, shirts, trousers, and suits', '👔', 2),
  ('Fashion & Apparel', 'Kids'' Wear', 'kids-wear', 'Children''s clothing, uniforms, and accessories', '👶', 3),
  ('Fashion & Apparel', 'Footwear', 'footwear', 'Shoes, sandals, sneakers, and formal wear', '👟', 4),
  ('Fashion & Apparel', 'Accessories', 'accessories', 'Bags, watches, jewelry, and sunglasses', '👜', 5),
  ('Fashion & Apparel', 'Winter Collection', 'winter-collection', 'Sweaters, jackets, shawls, and warm wear', '🧥', 6),
  ('Fashion & Apparel', 'Wedding & Formal', 'wedding-formal', 'Bridal wear, sherwani, and formal suits', '💍', 7)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Electronics & Gadgets', 'Smartphones', 'smartphones', 'Mobile phones, accessories, and repairs', '📱', 1),
  ('Electronics & Gadgets', 'Laptops & Computers', 'laptops-computers', 'Notebooks, desktops, and peripherals', '💻', 2),
  ('Electronics & Gadgets', 'Audio & Headphones', 'audio-headphones', 'Speakers, earphones, headphones, and audio gear', '🎧', 3),
  ('Electronics & Gadgets', 'Chargers & Cables', 'chargers-cables', 'Power banks, chargers, USB cables, and adapters', '🔌', 4),
  ('Electronics & Gadgets', 'Cameras', 'cameras', 'DSLR, mirrorless, action cams, and accessories', '📷', 5),
  ('Electronics & Gadgets', 'Home Appliances', 'home-appliances', 'Irons, blenders, microwaves, and kitchen gadgets', '🏠', 6)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Home & Living', 'Furniture', 'furniture', 'Beds, sofas, tables, chairs, and storage', '🛋️', 1),
  ('Home & Living', 'Kitchen & Dining', 'kitchen-dining', 'Cookware, utensils, dinner sets, and glassware', '🍽️', 2),
  ('Home & Living', 'Home Décor', 'home-decor', 'Vases, wall art, clocks, mirrors, and candles', '🖼️', 3),
  ('Home & Living', 'Bedding & Linens', 'bedding-linens', 'Bed sheets, pillows, blankets, and towels', '🛏️', 4),
  ('Home & Living', 'Lighting', 'lighting', 'Lamps, bulbs, chandeliers, and decorative lights', '💡', 5),
  ('Home & Living', 'Cleaning & Supplies', 'cleaning-supplies', 'Cleaning tools, detergents, and organizers', '🧹', 6)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Health & Beauty', 'Skincare', 'skincare', 'Creams, serums, sunscreens, and face masks', '🧴', 1),
  ('Health & Beauty', 'Makeup', 'makeup', 'Lipsticks, foundations, eyeshadows, and palettes', '💄', 2),
  ('Health & Beauty', 'Hair Care', 'hair-care', 'Shampoos, conditioners, oils, and styling products', '💇', 3),
  ('Health & Beauty', 'Fragrances', 'fragrances', 'Perfumes, attars, body sprays, and deodorants', '🌸', 4),
  ('Health & Beauty', 'Personal Care', 'personal-care', 'Soaps, lotions, oral care, and hygiene products', '🧼', 5)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Sports & Fitness', 'Exercise Equipment', 'exercise-equipment', 'Treadmills, dumbbells, yoga mats, and resistance bands', '🏋️', 1),
  ('Sports & Fitness', 'Sportswear', 'sportswear', 'Activewear, gym clothes, tracksuits, and sports shoes', '👟', 2),
  ('Sports & Fitness', 'Outdoor & Adventure', 'outdoor-adventure', 'Camping gear, hiking, cycling, and sports accessories', '⛺', 3),
  ('Sports & Fitness', 'Supplements', 'supplements', 'Protein powders, vitamins, energy bars, and nutrition', '💊', 4)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Books & Stationery', 'Fiction & Novels', 'fiction-novels', 'Novels, literature, and fiction books', '📖', 1),
  ('Books & Stationery', 'Educational', 'educational', 'Textbooks, guides, exam prep, and academic books', '📚', 2),
  ('Books & Stationery', 'Stationery', 'stationery', 'Pens, notebooks, art supplies, and office essentials', '✏️', 3),
  ('Books & Stationery', 'Islamic & Religious', 'islamic-religious', 'Quran, Islamic books, and religious literature', '☪️', 4)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Toys & Baby Care', 'Toys & Games', 'toys-games', 'Action figures, puzzles, board games, and dolls', '🧸', 1),
  ('Toys & Baby Care', 'Baby Gear', 'baby-gear', 'Strollers, baby carriers, high chairs, and walkers', '👶', 2),
  ('Toys & Baby Care', 'Baby Clothing', 'baby-clothing', 'Onesies, bibs, baby suits, and infant wear', '🍼', 3),
  ('Toys & Baby Care', 'Diapers & Wipes', 'diapers-wipes', 'Diapers, baby wipes, and changing essentials', '🧷', 4)
ON CONFLICT (category, slug) DO NOTHING;

INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Automotive Accessories', 'Car Electronics', 'car-electronics', 'Stereos, speakers, dashcams, and GPS', '📻', 1),
  ('Automotive Accessories', 'Car Care', 'car-care', 'Cleaning kits, waxes, polishes, and air fresheners', '🧽', 2),
  ('Automotive Accessories', 'Interior Accessories', 'interior-accessories', 'Seat covers, mats, steering covers, and organizers', '💺', 3),
  ('Automotive Accessories', 'Exterior & Parts', 'exterior-parts', 'Mirrors, lights, bumpers, and body kits', '🔧', 4),
  ('Automotive Accessories', 'Motorcycle Accessories', 'motorcycle-accessories', 'Helmets, gloves, bike covers, and parts', '🏍️', 5)
ON CONFLICT (category, slug) DO NOTHING;

-- ── 4. Products Table Enhancements ───────────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id text DEFAULT NULL;

-- Older "fresh_consolidated" migrations created category_id as uuid, but the
-- app stores main-category NAMES (e.g. "Tech & IT Services") here. Convert
-- any leftover uuid column to text so inserts stop failing with 22P02.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'category_id'
      AND udt_name = 'uuid'
  ) THEN
    ALTER TABLE public.products
      ALTER COLUMN category_id DROP DEFAULT;
    ALTER TABLE public.products
      ALTER COLUMN category_id TYPE text USING category_id::text;
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sub_category_id uuid DEFAULT NULL REFERENCES public.sub_categories(id) ON DELETE SET NULL;

-- Legacy fallback field — see lib/formatters.ts::getProductDiscount()
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(10,2) DEFAULT NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_status text DEFAULT 'in_stock'
  CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'pre_order'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS title text DEFAULT NULL;

UPDATE public.products SET title = name WHERE title IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sub_category_id ON public.products(sub_category_id);
CREATE INDEX IF NOT EXISTS idx_products_stock_status ON public.products(stock_status);
CREATE INDEX IF NOT EXISTS idx_products_compare_at_price ON public.products(compare_at_price)
  WHERE compare_at_price IS NOT NULL AND compare_at_price > 0;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON public.products USING gin (description gin_trgm_ops);

-- ── 5. Enable RLS on sub_categories ──────────────────────────────────────────
ALTER TABLE public.sub_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_categories_public_read" ON public.sub_categories;
CREATE POLICY "sub_categories_public_read" ON public.sub_categories
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "sub_categories_admin_manage" ON public.sub_categories;
CREATE POLICY "sub_categories_admin_manage" ON public.sub_categories
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

COMMIT;
