-- =============================================================================
-- TrendMart — Sub-Categories & Product Enhancements Migration
-- 
-- Adds:
--   1. sub_categories table with mandatory 'Others' entry per category
--   2. Enhanced products table columns (category_id, sub_category_id, 
--      compare_at_price, images, stock_status)
-- =============================================================================

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

-- Partial unique index: only ONE 'Others / General' entry per category
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_categories_one_others_per_category
  ON public.sub_categories (category, is_others)
  WHERE is_others = true;

-- Index for fast lookup by category
CREATE INDEX IF NOT EXISTS idx_sub_categories_category ON public.sub_categories(category, sort_order);

-- ── 2. Seed sub-categories with 'Others' for all main categories ─────────────
-- Each main category gets its own 'Others / General' entry plus a few meaningful sub-categories.

DO $$
DECLARE
  cat record;
  cat_others_id uuid;
BEGIN
  -- Iterate through all main categories and ensure an 'Others' entry exists
  FOR cat IN 
    SELECT unnest(ARRAY[
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
    -- Insert or get existing 'Others' entry
    INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order, is_others)
    VALUES (
      cat.category_name,
      'Others / General',
      lower(regexp_replace(cat.category_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-others',
      'Items that do not fit specific sub-categories within ' || cat.category_name,
      '📦',
      999, -- Always last
      true
    )
    ON CONFLICT (category, slug) DO NOTHING;
  END LOOP;
END $$;

-- ── 3. Seed meaningful sub-categories for key categories ────────────────────

-- Fashion & Apparel
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Fashion & Apparel', 'Women''s Clothing', 'womens-clothing', 'Dresses, tops, kurtis, and casual wear', '👗', 1),
  ('Fashion & Apparel', 'Men''s Clothing', 'mens-clothing', 'Shalwar kameez, shirts, trousers, and suits', '👔', 2),
  ('Fashion & Apparel', 'Kids'' Wear', 'kids-wear', 'Children''s clothing, uniforms, and accessories', '👶', 3),
  ('Fashion & Apparel', 'Footwear', 'footwear', 'Shoes, sandals, sneakers, and formal wear', '👟', 4),
  ('Fashion & Apparel', 'Accessories', 'accessories', 'Bags, watches, jewelry, and sunglasses', '👜', 5),
  ('Fashion & Apparel', 'Winter Collection', 'winter-collection', 'Sweaters, jackets, shawls, and warm wear', '🧥', 6),
  ('Fashion & Apparel', 'Wedding & Formal', 'wedding-formal', 'Bridal wear, sherwani, and formal suits', '💍', 7)
ON CONFLICT (category, slug) DO NOTHING;

-- Electronics & Gadgets
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Electronics & Gadgets', 'Smartphones', 'smartphones', 'Mobile phones, accessories, and repairs', '📱', 1),
  ('Electronics & Gadgets', 'Laptops & Computers', 'laptops-computers', 'Notebooks, desktops, and peripherals', '💻', 2),
  ('Electronics & Gadgets', 'Audio & Headphones', 'audio-headphones', 'Speakers, earphones, headphones, and audio gear', '🎧', 3),
  ('Electronics & Gadgets', 'Chargers & Cables', 'chargers-cables', 'Power banks, chargers, USB cables, and adapters', '🔌', 4),
  ('Electronics & Gadgets', 'Cameras', 'cameras', 'DSLR, mirrorless, action cams, and accessories', '📷', 5),
  ('Electronics & Gadgets', 'Home Appliances', 'home-appliances', 'Irons, blenders, microwaves, and kitchen gadgets', '🏠', 6)
ON CONFLICT (category, slug) DO NOTHING;

-- Home & Living
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Home & Living', 'Furniture', 'furniture', 'Beds, sofas, tables, chairs, and storage', '🛋️', 1),
  ('Home & Living', 'Kitchen & Dining', 'kitchen-dining', 'Cookware, utensils, dinner sets, and glassware', '🍽️', 2),
  ('Home & Living', 'Home Décor', 'home-decor', 'Vases, wall art, clocks, mirrors, and candles', '🖼️', 3),
  ('Home & Living', 'Bedding & Linens', 'bedding-linens', 'Bed sheets, pillows, blankets, and towels', '🛏️', 4),
  ('Home & Living', 'Lighting', 'lighting', 'Lamps, bulbs, chandeliers, and decorative lights', '💡', 5),
  ('Home & Living', 'Cleaning & Supplies', 'cleaning-supplies', 'Cleaning tools, detergents, and organizers', '🧹', 6)
ON CONFLICT (category, slug) DO NOTHING;

-- Health & Beauty
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Health & Beauty', 'Skincare', 'skincare', 'Creams, serums, sunscreens, and face masks', '🧴', 1),
  ('Health & Beauty', 'Makeup', 'makeup', 'Lipsticks, foundations, eyeshadows, and palettes', '💄', 2),
  ('Health & Beauty', 'Hair Care', 'hair-care', 'Shampoos, conditioners, oils, and styling products', '💇', 3),
  ('Health & Beauty', 'Fragrances', 'fragrances', 'Perfumes, attars, body sprays, and deodorants', '🌸', 4),
  ('Health & Beauty', 'Personal Care', 'personal-care', 'Soaps, lotions, oral care, and hygiene products', '🧼', 5)
ON CONFLICT (category, slug) DO NOTHING;

-- Sports & Fitness
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Sports & Fitness', 'Exercise Equipment', 'exercise-equipment', 'Treadmills, dumbbells, yoga mats, and resistance bands', '🏋️', 1),
  ('Sports & Fitness', 'Sportswear', 'sportswear', 'Activewear, gym clothes, tracksuits, and sports shoes', '👟', 2),
  ('Sports & Fitness', 'Outdoor & Adventure', 'outdoor-adventure', 'Camping gear, hiking, cycling, and sports accessories', '⛺', 3),
  ('Sports & Fitness', 'Supplements', 'supplements', 'Protein powders, vitamins, energy bars, and nutrition', '💊', 4)
ON CONFLICT (category, slug) DO NOTHING;

-- Books & Stationery
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Books & Stationery', 'Fiction & Novels', 'fiction-novels', 'Novels, literature, and fiction books', '📖', 1),
  ('Books & Stationery', 'Educational', 'educational', 'Textbooks, guides, exam prep, and academic books', '📚', 2),
  ('Books & Stationery', 'Stationery', 'stationery', 'Pens, notebooks, art supplies, and office essentials', '✏️', 3),
  ('Books & Stationery', 'Islamic & Religious', 'islamic-religious', 'Quran, Islamic books, and religious literature', '☪️', 4)
ON CONFLICT (category, slug) DO NOTHING;

-- Toys & Baby Care
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Toys & Baby Care', 'Toys & Games', 'toys-games', 'Action figures, puzzles, board games, and dolls', '🧸', 1),
  ('Toys & Baby Care', 'Baby Gear', 'baby-gear', 'Strollers, baby carriers, high chairs, and walkers', '👶', 2),
  ('Toys & Baby Care', 'Baby Clothing', 'baby-clothing', 'Onesies, bibs, baby suits, and infant wear', '🍼', 3),
  ('Toys & Baby Care', 'Diapers & Wipes', 'diapers-wipes', 'Diapers, baby wipes, and changing essentials', '🧷', 4)
ON CONFLICT (category, slug) DO NOTHING;

-- Automotive Accessories
INSERT INTO public.sub_categories (category, name, slug, description, icon, sort_order) VALUES
  ('Automotive Accessories', 'Car Electronics', 'car-electronics', 'Stereos, speakers, dashcams, and GPS', '📻', 1),
  ('Automotive Accessories', 'Car Care', 'car-care', 'Cleaning kits, waxes, polishes, and air fresheners', '🧽', 2),
  ('Automotive Accessories', 'Interior Accessories', 'interior-accessories', 'Seat covers, mats, steering covers, and organizers', '💺', 3),
  ('Automotive Accessories', 'Exterior & Parts', 'exterior-parts', 'Mirrors, lights, bumpers, and body kits', '🔧', 4),
  ('Automotive Accessories', 'Motorcycle Accessories', 'motorcycle-accessories', 'Helmets, gloves, bike covers, and parts', '🏍️', 5)
ON CONFLICT (category, slug) DO NOTHING;

-- ── 4. Products Table Enhancements ───────────────────────────────────────────

-- Add category_id column
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id text DEFAULT NULL;

-- Add sub_category_id column (FK to sub_categories table)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sub_category_id uuid DEFAULT NULL REFERENCES public.sub_categories(id) ON DELETE SET NULL;

-- Add compare_at_price (original/discounted price comparison)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(10,2) DEFAULT NULL;

-- Add images array (JSON array of image URLs for product gallery)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS images jsonb DEFAULT '[]'::jsonb;

-- Add stock_status enum-like field (in_stock, low_stock, out_of_stock, pre_order)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_status text DEFAULT 'in_stock'
  CHECK (stock_status IN ('in_stock', 'low_stock', 'out_of_stock', 'pre_order'));

-- Add title field (synonym for name, used in marketplace context)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS title text DEFAULT NULL;

-- Update existing products: set title = name if null
UPDATE public.products SET title = name WHERE title IS NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sub_category_id ON public.products(sub_category_id);
CREATE INDEX IF NOT EXISTS idx_products_stock_status ON public.products(stock_status);
CREATE INDEX IF NOT EXISTS idx_products_compare_at_price ON public.products(compare_at_price)
  WHERE compare_at_price IS NOT NULL AND compare_at_price > 0;

-- Full-text search index for smart search across name/title/description
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_description_trgm ON public.products USING gin (description gin_trgm_ops);

-- ── 5. Enable RLS on sub_categories ──────────────────────────────────────────
ALTER TABLE public.sub_categories ENABLE ROW LEVEL SECURITY;

-- Public read access (sub-categories are global platform data)
DROP POLICY IF EXISTS "sub_categories_public_read" ON public.sub_categories;
CREATE POLICY "sub_categories_public_read" ON public.sub_categories
  FOR SELECT
  USING (is_active = true);

-- Admin insert/update policy (only authenticated users for now, tightened later)
DROP POLICY IF EXISTS "sub_categories_admin_manage" ON public.sub_categories;
CREATE POLICY "sub_categories_admin_manage" ON public.sub_categories
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- ── 6. Update products RLS to include new columns ────────────────────────────
-- (RLS policies from 000-all.sql already cover SELECT/INSERT/UPDATE on products,
--  new columns are automatically included in those policies)