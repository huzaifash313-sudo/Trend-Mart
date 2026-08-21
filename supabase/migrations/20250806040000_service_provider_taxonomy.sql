/* -------------------------------------------------------------------------- */
/*  TrendMart — Service Provider Category Taxonomy & Infrastructure            */
/*                                                                             */
/*  Adds service-sector support alongside physical retail:                      */
/*   1. New service categories in the taxonomy                                 */
/*   2. Service-specific columns on shops table                                */
/*   3. Service packages table (predefined offerings)                          */
/*   4. Service portfolio table (before/after project photos)                  */
/*   5. Service availability / working hours table                             */
/*   6. Performance indexes & RLS policies                                    */
/* -------------------------------------------------------------------------- */

-- ============================================================================
-- 1. EXTEND SHOPS TABLE WITH SERVICE-SPECIFIC COLUMNS
-- ============================================================================

-- Service area coverage (e.g., "Gulberg, DHA, Johar Town — Lahore")
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS service_area TEXT;

-- Hourly rate for service professionals (optional, displayed on storefront)
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10, 2);

-- One-time call-out / visit charge
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS call_out_charge NUMERIC(10, 2);

-- Whether the service provider accepts emergency/urgent calls
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS emergency_available BOOLEAN DEFAULT false;

-- Enum-like shop type: 'retail' (default) or 'service'
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_type TEXT DEFAULT 'retail' CHECK (shop_type IN ('retail', 'service'));

-- Composite index for filtering service shops by category + type
CREATE INDEX IF NOT EXISTS idx_shops_shop_type ON public.shops(shop_type) WHERE shop_type = 'service';
CREATE INDEX IF NOT EXISTS idx_shops_service_area ON public.shops USING GIN (to_tsvector('simple', COALESCE(service_area, '')));

-- ============================================================================
-- 2. SERVICE PACKAGES TABLE (Predefined Offerings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID NOT NULL,
  name TEXT NOT NULL,                       -- e.g. "AC Full Service", "Ceiling Fan Installation"
  description TEXT DEFAULT '',
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,  -- fixed price for this package
  currency TEXT DEFAULT 'PKR',
  estimated_duration TEXT DEFAULT '',       -- e.g. "1-2 hours", "30 mins"
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_service_packages_shop
    FOREIGN KEY (shop_id)
    REFERENCES public.shops(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_packages_shop_id ON public.service_packages(shop_id);
CREATE INDEX IF NOT EXISTS idx_service_packages_active ON public.service_packages(shop_id, is_active);

ALTER TABLE public.service_packages ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Allow public read on service_packages"
  ON public.service_packages
  FOR SELECT
  USING (true);

-- Shop owners manage their own service packages
CREATE POLICY "Owners can manage their service packages"
  ON public.service_packages
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.shops WHERE id = service_packages.shop_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT owner_id FROM public.shops WHERE id = service_packages.shop_id
    )
  );

-- ============================================================================
-- 3. SERVICE PORTFOLIO TABLE (Before/After Project Photos)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_portfolio (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID NOT NULL,
  title TEXT NOT NULL,                      -- e.g. "AC Repair — Split Unit Deep Clean"
  description TEXT DEFAULT '',              -- brief description of the completed job
  before_image_url TEXT,                    -- "before" photo
  after_image_url TEXT,                     -- "after" photo
  client_name TEXT DEFAULT '',              -- anonymized or with permission
  client_review TEXT DEFAULT '',            -- verified client testimonial
  client_rating INT DEFAULT 0 CHECK (client_rating >= 0 AND client_rating <= 5),
  project_date DATE DEFAULT CURRENT_DATE,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_service_portfolio_shop
    FOREIGN KEY (shop_id)
    REFERENCES public.shops(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_service_portfolio_shop_id ON public.service_portfolio(shop_id);
CREATE INDEX IF NOT EXISTS idx_service_portfolio_published ON public.service_portfolio(shop_id, is_published);
CREATE INDEX IF NOT EXISTS idx_service_portfolio_date ON public.service_portfolio(shop_id, project_date DESC);

ALTER TABLE public.service_portfolio ENABLE ROW LEVEL SECURITY;

-- Public read on published portfolio items
CREATE POLICY "Allow public read on published portfolio"
  ON public.service_portfolio
  FOR SELECT
  USING (is_published = true);

-- Shop owners manage their own portfolio
CREATE POLICY "Owners can manage their portfolio"
  ON public.service_portfolio
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.shops WHERE id = service_portfolio.shop_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT owner_id FROM public.shops WHERE id = service_portfolio.shop_id
    )
  );

-- ============================================================================
-- 4. SERVICE AVAILABILITY / WORKING HOURS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID NOT NULL,
  -- Day of week: 0=Sunday, 1=Monday ... 6=Saturday
  day_of_week INT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_working_day BOOLEAN DEFAULT true,
  -- Time slots (store as text for flexibility, e.g. "09:00", "20:00")
  start_time TIME DEFAULT '09:00',
  end_time TIME DEFAULT '18:00',
  -- Whether emergency/after-hours service is available on this day
  emergency_available BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_service_availability_shop
    FOREIGN KEY (shop_id)
    REFERENCES public.shops(id)
    ON DELETE CASCADE,

  -- One row per shop per day
  CONSTRAINT uq_service_availability_shop_day UNIQUE (shop_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_service_availability_shop_id ON public.service_availability(shop_id);

ALTER TABLE public.service_availability ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Allow public read on service_availability"
  ON public.service_availability
  FOR SELECT
  USING (true);

-- Shop owners manage their own availability
CREATE POLICY "Owners can manage their availability"
  ON public.service_availability
  FOR ALL
  USING (
    auth.uid() IN (
      SELECT owner_id FROM public.shops WHERE id = service_availability.shop_id
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT owner_id FROM public.shops WHERE id = service_availability.shop_id
    )
  );

-- ============================================================================
-- 5. AUTO-UPDATE TRIGGERS FOR SERVICE TABLES
-- ============================================================================

-- Trigger function already exists: public.set_updated_at()
-- Apply to service_packages
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_service_packages_updated_at'
  ) THEN
    CREATE TRIGGER trg_service_packages_updated_at
      BEFORE UPDATE ON public.service_packages
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Apply to service_portfolio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_service_portfolio_updated_at'
  ) THEN
    CREATE TRIGGER trg_service_portfolio_updated_at
      BEFORE UPDATE ON public.service_portfolio
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- Apply to service_availability
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_service_availability_updated_at'
  ) THEN
    CREATE TRIGGER trg_service_availability_updated_at
      BEFORE UPDATE ON public.service_availability
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_packages TO authenticated;
GRANT SELECT ON public.service_packages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_portfolio TO authenticated;
GRANT SELECT ON public.service_portfolio TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_availability TO authenticated;
GRANT SELECT ON public.service_availability TO anon;