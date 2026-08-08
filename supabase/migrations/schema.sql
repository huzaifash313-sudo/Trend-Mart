-- =============================================================================
-- TrendMart Schema Migration
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
-- =============================================================================

-- 1. Shops table --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shops (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name          text NOT NULL,
  category      text NOT NULL,
  location      text NOT NULL DEFAULT '',
  whatsapp_number text NOT NULL DEFAULT '',
  logo_url      text,
  is_live       boolean DEFAULT false,
  created_at    timestamptz DEFAULT now()
);

-- Enable Row Level Security with read-all policy (public marketplace)
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read shops
CREATE POLICY "Allow public read on shops"
  ON public.shops
  FOR SELECT
  USING (true);

-- 2. Products table -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name          text NOT NULL,
  description   text DEFAULT '',
  price         numeric(10,2) NOT NULL DEFAULT 0,
  currency      text DEFAULT 'PKR',
  image_url     text,
  is_available  boolean DEFAULT true,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on products"
  ON public.products
  FOR SELECT
  USING (true);

-- 3. Indexes ------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_products_shop_id ON public.products(shop_id);
CREATE INDEX IF NOT EXISTS idx_shops_category ON public.shops(category);