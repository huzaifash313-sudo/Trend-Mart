-- Shop card floating offer ticker: merchant-selectable offer end time
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS announcement_expires_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.shops.announcement_expires_at IS
  'When the promotional announcement / offer expires. Null = no timed expiry. Used by homepage shop-card offer ticker.';

CREATE INDEX IF NOT EXISTS idx_shops_announcement_expires_at
  ON public.shops (announcement_expires_at)
  WHERE announcement_expires_at IS NOT NULL;
