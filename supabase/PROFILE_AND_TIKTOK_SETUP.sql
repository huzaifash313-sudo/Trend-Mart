-- TrendMart: TikTok on shops + customer avatar on user_profiles
-- Run once in Supabase SQL Editor (safe / idempotent).

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS tiktok_handle text;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.shops.tiktok_handle IS 'TikTok username (with or without @); storefront links to tiktok.com/@handle';
COMMENT ON COLUMN public.user_profiles.avatar_url IS 'Customer profile photo public URL (Supabase storage)';
