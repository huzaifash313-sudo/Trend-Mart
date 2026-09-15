-- TrendsMart: merchant custom category / subcategory requests + platform customs.
-- Merchants can propose; usable for their shop while pending; admin approve / disable.

-- ── Platform custom main categories (beyond hardcoded SHOP_CATEGORIES) ───────
CREATE TABLE IF NOT EXISTS public.platform_categories (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name                 text NOT NULL,
  slug                 text NOT NULL,
  icon                 text NOT NULL DEFAULT '📦',
  description          text NOT NULL DEFAULT '',
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected', 'disabled')),
  is_active            boolean NOT NULL DEFAULT true,
  sort_order           integer NOT NULL DEFAULT 200,
  requested_by_shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL,
  reviewed_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  rejection_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_categories_name_unique UNIQUE (name),
  CONSTRAINT platform_categories_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_platform_categories_status
  ON public.platform_categories(status, is_active);

-- ── Requests queue (category + subcategory) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.category_requests (
  id                        uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id                   uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  request_type              text NOT NULL CHECK (request_type IN ('category', 'subcategory')),
  category_name             text,
  category_icon             text DEFAULT '📦',
  category_description      text DEFAULT '',
  proposed_subcategories    jsonb NOT NULL DEFAULT '[]'::jsonb,
  parent_category           text,
  subcategory_name          text,
  subcategory_icon          text DEFAULT '📦',
  subcategory_description   text DEFAULT '',
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  platform_category_id      uuid REFERENCES public.platform_categories(id) ON DELETE SET NULL,
  created_sub_category_id   uuid REFERENCES public.sub_categories(id) ON DELETE SET NULL,
  reviewed_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at               timestamptz,
  rejection_reason          text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_requests_status
  ON public.category_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_category_requests_shop
  ON public.category_requests(shop_id, created_at DESC);

-- Sub-categories: track merchant-originated rows for admin control
ALTER TABLE public.sub_categories
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.sub_categories
  ADD COLUMN IF NOT EXISTS requested_by_shop_id uuid REFERENCES public.shops(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sub_categories_approval_status_check'
  ) THEN
    ALTER TABLE public.sub_categories
      ADD CONSTRAINT sub_categories_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sub_categories_approval
  ON public.sub_categories(approval_status)
  WHERE approval_status = 'pending';

-- ── updated_at helpers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_platform_categories_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_platform_categories_updated_at ON public.platform_categories;
CREATE TRIGGER trg_platform_categories_updated_at
  BEFORE UPDATE ON public.platform_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_platform_categories_updated_at();

CREATE OR REPLACE FUNCTION public.touch_category_requests_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_category_requests_updated_at ON public.category_requests;
CREATE TRIGGER trg_category_requests_updated_at
  BEFORE UPDATE ON public.category_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_category_requests_updated_at();

-- Merchants cannot self-approve
CREATE OR REPLACE FUNCTION public.guard_category_requests_review_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    RETURN NEW;
  END IF;

  NEW.status := OLD.status;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.rejection_reason := OLD.rejection_reason;
  NEW.platform_category_id := OLD.platform_category_id;
  NEW.created_sub_category_id := OLD.created_sub_category_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_category_requests ON public.category_requests;
CREATE TRIGGER trg_guard_category_requests
  BEFORE INSERT OR UPDATE ON public.category_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_category_requests_review_fields();

CREATE OR REPLACE FUNCTION public.guard_platform_categories_review_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    RETURN NEW;
  END IF;

  NEW.status := OLD.status;
  NEW.is_active := OLD.is_active;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.rejection_reason := OLD.rejection_reason;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_platform_categories ON public.platform_categories;
CREATE TRIGGER trg_guard_platform_categories
  BEFORE INSERT OR UPDATE ON public.platform_categories
  FOR EACH ROW EXECUTE FUNCTION public.guard_platform_categories_review_fields();

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.platform_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_categories_public_read_approved" ON public.platform_categories;
CREATE POLICY "platform_categories_public_read_approved" ON public.platform_categories
  FOR SELECT USING (
    (status = 'approved' AND is_active = true)
    OR public.is_admin()
    OR (
      requested_by_shop_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.shops s
        WHERE s.id = platform_categories.requested_by_shop_id
          AND s.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "platform_categories_merchant_insert" ON public.platform_categories;
CREATE POLICY "platform_categories_merchant_insert" ON public.platform_categories
  FOR INSERT WITH CHECK (
    public.is_admin()
    OR (
      requested_by_shop_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.shops s
        WHERE s.id = requested_by_shop_id
          AND s.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "platform_categories_admin_manage" ON public.platform_categories;
CREATE POLICY "platform_categories_admin_manage" ON public.platform_categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "category_requests_merchant_select" ON public.category_requests;
CREATE POLICY "category_requests_merchant_select" ON public.category_requests
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = category_requests.shop_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "category_requests_merchant_insert" ON public.category_requests;
CREATE POLICY "category_requests_merchant_insert" ON public.category_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id
        AND s.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "category_requests_admin_manage" ON public.category_requests;
CREATE POLICY "category_requests_admin_manage" ON public.category_requests
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.platform_categories TO anon, authenticated;
GRANT INSERT ON public.platform_categories TO authenticated;
GRANT ALL ON public.platform_categories TO service_role;

GRANT SELECT, INSERT ON public.category_requests TO authenticated;
GRANT ALL ON public.category_requests TO service_role;

COMMENT ON TABLE public.platform_categories IS
  'Merchant-proposed main shop categories. Pending = shop-only; approved = platform-wide; disabled = admin shut off.';
COMMENT ON TABLE public.category_requests IS
  'Admin queue for custom category / subcategory proposals from merchants.';

-- Merchants may insert pending sub-categories for their own shop (admin can deactivate)
DROP POLICY IF EXISTS "sub_categories_merchant_insert_pending" ON public.sub_categories;
CREATE POLICY "sub_categories_merchant_insert_pending" ON public.sub_categories
  FOR INSERT
  WITH CHECK (
    approval_status = 'pending'
    AND requested_by_shop_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = requested_by_shop_id
        AND s.owner_id = auth.uid()
    )
  );

-- Merchant can read their own pending (even if somehow inactive)
DROP POLICY IF EXISTS "sub_categories_merchant_read_own_pending" ON public.sub_categories;
CREATE POLICY "sub_categories_merchant_read_own_pending" ON public.sub_categories
  FOR SELECT
  USING (
    requested_by_shop_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = requested_by_shop_id
        AND s.owner_id = auth.uid()
    )
  );
