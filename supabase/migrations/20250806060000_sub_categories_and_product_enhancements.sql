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
