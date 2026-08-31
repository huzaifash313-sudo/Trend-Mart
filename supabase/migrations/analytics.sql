-- =============================================================================
-- TrendsMart — Analytics / Views Tracking Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.analytics_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid REFERENCES public.shops(id) ON DELETE CASCADE,
  event_type    text NOT NULL DEFAULT 'shop_view',
  -- 'shop_view' | 'product_click'
  product_id    uuid REFERENCES public.products(id) ON DELETE SET NULL,
  visitor_ip    text,
  user_agent    text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_shop_id ON public.analytics_logs(shop_id);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_logs(created_at DESC);

ALTER TABLE public.analytics_logs ENABLE ROW LEVEL SECURITY;

-- Anyone can insert analytics events
CREATE POLICY "analytics_public_insert"
  ON public.analytics_logs FOR INSERT
  WITH CHECK (true);

-- Shop owner can read their own analytics
CREATE POLICY "analytics_owner_read"
  ON public.analytics_logs FOR SELECT
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );