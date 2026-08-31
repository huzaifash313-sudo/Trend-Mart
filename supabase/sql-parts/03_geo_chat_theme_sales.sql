-- TrendsMart SQL part file — run in order in Supabase SQL Editor
-- If 'Failed to fetch (api.supabase.com)' appears: wait 10s, re-run THIS part only, or try another browser / disable VPN.

-- #############################################################################
-- PART 3 — GEO-RADIUS HELPERS + CHAT / THEME / SALES-ANALYTICS TABLES
-- #############################################################################

BEGIN;

-- 1. Sales events table for detailed analytics
CREATE TABLE IF NOT EXISTS public.sales_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  event_type TEXT NOT NULL DEFAULT 'sale' CHECK (event_type IN ('sale', 'refund', 'lead', 'inquiry')),
  customer_phone TEXT,
  customer_name TEXT,
  source TEXT DEFAULT 'whatsapp' CHECK (source IN ('whatsapp', 'catalog', 'chatbot', 'direct', 'other')),
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "sales_events" table.
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS amount DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'sale';
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'whatsapp';
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;
ALTER TABLE public.sales_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_sales_events_shop_date ON public.sales_events(shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_events_type ON public.sales_events(event_type);

-- Daily revenue snapshot for charts
CREATE TABLE IF NOT EXISTS public.daily_revenue_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  unique_customers INTEGER DEFAULT 0,
  top_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  top_product_name TEXT,
  top_product_revenue DECIMAL(12,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shop_id, snapshot_date)
);

-- Safety net: backfill any columns missing from an older/partial "daily_revenue_snapshots" table.
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS total_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS order_count INTEGER DEFAULT 0;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS unique_customers INTEGER DEFAULT 0;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS top_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS top_product_name TEXT;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS top_product_revenue DECIMAL(12,2) DEFAULT 0;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB;
ALTER TABLE public.daily_revenue_snapshots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_daily_revenue_shop_date ON public.daily_revenue_snapshots(shop_id, snapshot_date DESC);

-- 2. AI Chat logs table
CREATE TABLE IF NOT EXISTS public.chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  visitor_ip TEXT,
  user_message TEXT NOT NULL,
  bot_response TEXT NOT NULL,
  intent TEXT,
  confidence DECIMAL(3,2) DEFAULT 0.0,
  resolved BOOLEAN DEFAULT false,
  feedback TEXT CHECK (feedback IS NULL OR feedback IN ('helpful', 'not_helpful')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "chat_logs" table.
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS visitor_ip TEXT;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS intent TEXT;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2) DEFAULT 0.0;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS feedback TEXT;
ALTER TABLE public.chat_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_chat_logs_shop ON public.chat_logs(shop_id, created_at DESC);

-- 3. Merchant theme preferences table
CREATE TABLE IF NOT EXISTS public.merchant_theme_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL UNIQUE REFERENCES public.shops(id) ON DELETE CASCADE,
  layout_style TEXT DEFAULT 'grid' CHECK (layout_style IN ('grid', 'compact', 'large_cards', 'list', 'gallery')),
  accent_color_override TEXT,
  font_scale DECIMAL(2,1) DEFAULT 1.0 CHECK (font_scale >= 0.8 AND font_scale <= 1.5),
  dark_mode_default BOOLEAN DEFAULT false,
  show_announcement_banner BOOLEAN DEFAULT true,
  show_whatsapp_floating_button BOOLEAN DEFAULT true,
  product_card_style TEXT DEFAULT 'default' CHECK (product_card_style IN ('default', 'minimal', 'detailed', 'service')),
  custom_css TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "merchant_theme_preferences" table.
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS layout_style TEXT DEFAULT 'grid';
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS accent_color_override TEXT;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS font_scale DECIMAL(2,1) DEFAULT 1.0;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS dark_mode_default BOOLEAN DEFAULT false;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS show_announcement_banner BOOLEAN DEFAULT true;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS show_whatsapp_floating_button BOOLEAN DEFAULT true;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS product_card_style TEXT DEFAULT 'default';
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS custom_css TEXT;
ALTER TABLE public.merchant_theme_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_theme_prefs_shop ON public.merchant_theme_preferences(shop_id);

-- 4. RLS Policies

ALTER TABLE public.sales_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their shop sales events" ON public.sales_events;
CREATE POLICY "Owners can view their shop sales events"
ON public.sales_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = sales_events.shop_id
    AND shops.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Public can insert sales events" ON public.sales_events;
CREATE POLICY "Public can insert sales events"
ON public.sales_events FOR INSERT
WITH CHECK (true);

ALTER TABLE public.daily_revenue_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their revenue snapshots" ON public.daily_revenue_snapshots;
CREATE POLICY "Owners can view their revenue snapshots"
ON public.daily_revenue_snapshots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = daily_revenue_snapshots.shop_id
    AND shops.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "System can insert revenue snapshots" ON public.daily_revenue_snapshots;
CREATE POLICY "System can insert revenue snapshots"
ON public.daily_revenue_snapshots FOR INSERT
WITH CHECK (true);

ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their chat logs" ON public.chat_logs;
CREATE POLICY "Owners can view their chat logs"
ON public.chat_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = chat_logs.shop_id
    AND shops.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Anyone can insert chat messages" ON public.chat_logs;
CREATE POLICY "Anyone can insert chat messages"
ON public.chat_logs FOR INSERT
WITH CHECK (true);

ALTER TABLE public.merchant_theme_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can manage their theme preferences" ON public.merchant_theme_preferences;
CREATE POLICY "Owners can manage their theme preferences"
ON public.merchant_theme_preferences FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = merchant_theme_preferences.shop_id
    AND shops.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Public can read theme preferences" ON public.merchant_theme_preferences;
CREATE POLICY "Public can read theme preferences"
ON public.merchant_theme_preferences
FOR SELECT
USING (true);

-- 5. Function: Aggregate daily revenue snapshot
CREATE OR REPLACE FUNCTION public.generate_daily_revenue_snapshot(
  p_shop_id UUID,
  p_date DATE DEFAULT CURRENT_DATE - 1
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_revenue DECIMAL(12,2);
  v_order_count INTEGER;
  v_unique_customers INTEGER;
  v_top_product_id UUID;
  v_top_product_name TEXT;
  v_top_product_revenue DECIMAL(12,2);
BEGIN
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(*),
    COUNT(DISTINCT customer_phone)
  INTO v_total_revenue, v_order_count, v_unique_customers
  FROM public.sales_events
  WHERE shop_id = p_shop_id
    AND event_type = 'sale'
    AND created_at::DATE = p_date;

  SELECT
    se.product_id,
    se.product_name,
    SUM(se.amount) as product_total
  INTO v_top_product_id, v_top_product_name, v_top_product_revenue
  FROM public.sales_events se
  WHERE se.shop_id = p_shop_id
    AND se.event_type = 'sale'
    AND se.created_at::DATE = p_date
    AND se.product_id IS NOT NULL
  GROUP BY se.product_id, se.product_name
  ORDER BY product_total DESC
  LIMIT 1;

  INSERT INTO public.daily_revenue_snapshots (
    shop_id, snapshot_date, total_revenue, order_count,
    unique_customers, top_product_id, top_product_name, top_product_revenue
  ) VALUES (
    p_shop_id, p_date, v_total_revenue, v_order_count,
    v_unique_customers, v_top_product_id, v_top_product_name,
    COALESCE(v_top_product_revenue, 0)
  )
  ON CONFLICT (shop_id, snapshot_date)
  DO UPDATE SET
    total_revenue = EXCLUDED.total_revenue,
    order_count = EXCLUDED.order_count,
    unique_customers = EXCLUDED.unique_customers,
    top_product_id = EXCLUDED.top_product_id,
    top_product_name = EXCLUDED.top_product_name,
    top_product_revenue = EXCLUDED.top_product_revenue,
    metadata = EXCLUDED.metadata;
END;
$$;

COMMIT;
