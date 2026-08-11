-- Paste in Supabase SQL Editor to enable multi-image deals (safe to re-run).
ALTER TABLE public.shop_deals
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb;
