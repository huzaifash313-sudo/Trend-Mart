-- ============================================================================
-- TrendMart: Geo-Radius, Analytics Extensions & Chat Logs Migration
-- Prompt 2: Geo-Radius Store Filtering
-- Prompt 3: AI Chat Widget (chat logs table)
-- Prompt 4: Advanced Analytics (sales_events, daily snapshots)
-- Prompt 5: Merchant Theme Preferences
-- ============================================================================

-- 1. Add geo-location columns to shops table (Prompt 2)
ALTER TABLE public.shops
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS service_radius_km INTEGER DEFAULT 10 CHECK (service_radius_km > 0 AND service_radius_km <= 500),
ADD COLUMN IF NOT EXISTS delivery_zones TEXT[] DEFAULT '{}'::TEXT[],
ADD COLUMN IF NOT EXISTS address_display TEXT;

-- GiST index for geo-spatial queries
CREATE INDEX IF NOT EXISTS idx_shops_geo_coords
ON public.shops USING gist (
  ll_to_earth(
    COALESCE(latitude, 31.5204),
    COALESCE(longitude, 74.3587)
  )
) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- 2. Sales events table for detailed analytics (Prompt 4)
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

CREATE INDEX IF NOT EXISTS idx_sales_events_shop_date
ON public.sales_events(shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_events_type
ON public.sales_events(event_type);

-- Daily revenue snapshot for charts (Prompt 4)
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

CREATE INDEX IF NOT EXISTS idx_daily_revenue_shop_date
ON public.daily_revenue_snapshots(shop_id, snapshot_date DESC);

-- 3. AI Chat logs table (Prompt 3)
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

CREATE INDEX IF NOT EXISTS idx_chat_logs_shop
ON public.chat_logs(shop_id, created_at DESC);

-- 4. Merchant theme preferences table (Prompt 5)
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

CREATE INDEX IF NOT EXISTS idx_theme_prefs_shop
ON public.merchant_theme_preferences(shop_id);

-- 5. RLS Policies

-- Sales events: owners can read their shop's events
ALTER TABLE public.sales_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their shop sales events"
ON public.sales_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = sales_events.shop_id
    AND shops.owner_id = auth.uid()
  )
);

CREATE POLICY "Public can insert sales events"
ON public.sales_events FOR INSERT
WITH CHECK (true);

-- Daily revenue snapshots: owners can view
ALTER TABLE public.daily_revenue_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their revenue snapshots"
ON public.daily_revenue_snapshots FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = daily_revenue_snapshots.shop_id
    AND shops.owner_id = auth.uid()
  )
);

CREATE POLICY "System can insert revenue snapshots"
ON public.daily_revenue_snapshots FOR INSERT
WITH CHECK (true);

-- Chat logs: owners can view, public can insert
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their chat logs"
ON public.chat_logs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = chat_logs.shop_id
    AND shops.owner_id = auth.uid()
  )
);

CREATE POLICY "Anyone can insert chat messages"
ON public.chat_logs FOR INSERT
WITH CHECK (true);

-- Theme preferences: owners have full access
ALTER TABLE public.merchant_theme_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their theme preferences"
ON public.merchant_theme_preferences FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.shops
    WHERE shops.id = merchant_theme_preferences.shop_id
    AND shops.owner_id = auth.uid()
  )
);

-- 6. Helper function: Calculate distance between two coordinates (Haversine formula)
CREATE OR REPLACE FUNCTION public.calculate_distance_km(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r DOUBLE PRECISION := 6371; -- Earth radius in km
  dlat DOUBLE PRECISION;
  dlng DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);
  a := sin(dlat / 2) * sin(dlat / 2) +
       cos(radians(lat1)) * cos(radians(lat2)) *
       sin(dlng / 2) * sin(dlng / 2);
  c := 2 * atan2(sqrt(a), sqrt(1 - a));
  RETURN r * c;
END;
$$;

-- 7. Function: Get nearby shops ordered by proximity
CREATE OR REPLACE FUNCTION public.get_nearby_shops(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  max_distance_km INTEGER DEFAULT 50
) RETURNS TABLE(
  id UUID,
  name TEXT,
  category TEXT,
  location TEXT,
  whatsapp_number TEXT,
  logo_url TEXT,
  banner_url TEXT,
  is_live BOOLEAN,
  created_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  service_radius_km INTEGER,
  distance_km DOUBLE PRECISION
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.category,
    s.location,
    s.whatsapp_number,
    s.logo_url,
    s.banner_url,
    s.is_live,
    s.created_at,
    s.latitude,
    s.longitude,
    s.service_radius_km,
    public.calculate_distance_km(user_lat, user_lng, COALESCE(s.latitude, 31.5204), COALESCE(s.longitude, 74.3587)) AS distance_km
  FROM public.shops s
  WHERE s.is_live = true
    AND (
      s.latitude IS NULL
      OR s.longitude IS NULL
      OR s.service_radius_km IS NULL
      OR public.calculate_distance_km(user_lat, user_lng, s.latitude, s.longitude) <= s.service_radius_km
    )
    AND public.calculate_distance_km(user_lat, user_lng, COALESCE(s.latitude, 31.5204), COALESCE(s.longitude, 74.3587)) <= max_distance_km
  ORDER BY distance_km ASC;
END;
$$;

-- 8. Function: Aggregate daily revenue snapshot
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
  -- Aggregate from sales_events for the given date
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(*),
    COUNT(DISTINCT customer_phone)
  INTO v_total_revenue, v_order_count, v_unique_customers
  FROM public.sales_events
  WHERE shop_id = p_shop_id
    AND event_type = 'sale'
    AND created_at::DATE = p_date;

  -- Find top product
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

  -- Upsert snapshot
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