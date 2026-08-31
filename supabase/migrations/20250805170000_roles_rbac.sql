-- =============================================================================
-- TrendsMart — Multi-Tenant Role-Based Access Control (RBAC) Schema
-- =============================================================================
-- Defines role types and user-role assignments for:
--   - customer:     Buyers browsing shops and placing orders
--   - merchant:     Shop owners managing products, orders, inventory
--   - admin:        System administrators with platform-wide access
-- =============================================================================

-- ── Role Enum Type ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('customer', 'merchant', 'admin');
  END IF;
END $$;

-- ── User Roles Table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.app_role NOT NULL DEFAULT 'customer',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),

  -- Each user can only have one role assignment record
  CONSTRAINT uq_user_role UNIQUE (user_id)
);

-- Index for fast role lookups in middleware and RLS policies
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own role
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Only admins can insert/update/delete roles (via service key in backend)
CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ── Auto-provision customer role on signup ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── Helper: Grant merchant role when user creates their first shop ─────────────
CREATE OR REPLACE FUNCTION public.promote_to_merchant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.owner_id, 'merchant')
  ON CONFLICT (user_id)
  DO UPDATE SET role = 'merchant', updated_at = now()
  WHERE public.user_roles.role = 'customer';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS after_shop_created ON public.shops;
CREATE TRIGGER after_shop_created
  AFTER INSERT ON public.shops
  FOR EACH ROW
  EXECUTE FUNCTION public.promote_to_merchant();

-- ── Enhanced RLS: Merchant-specific policies for shops table ───────────────────
-- Merchants can only CRUD their own shops
DROP POLICY IF EXISTS "shops_owner_all" ON public.shops;
CREATE POLICY "shops_owner_all"
  ON public.shops FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Anyone can read live shops
DROP POLICY IF EXISTS "shops_public_read" ON public.shops;
CREATE POLICY "shops_public_read"
  ON public.shops FOR SELECT
  USING (is_live = true OR auth.uid() = owner_id);

-- ── Enhanced RLS: Merchant-specific policies for products table ────────────────
DROP POLICY IF EXISTS "products_owner_all" ON public.products;
CREATE POLICY "products_owner_all"
  ON public.products FOR ALL
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shops
      WHERE shops.id = products.shop_id
      AND shops.is_live = true
    )
    OR
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = products.shop_id)
  );

-- ── Admin: System-wide access policies ─────────────────────────────────────────
-- Admins can read all shops
CREATE POLICY "shops_admin_read"
  ON public.shops FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can read all orders
DROP POLICY IF EXISTS "orders_admin_read" ON public.orders;
CREATE POLICY "orders_admin_read"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );