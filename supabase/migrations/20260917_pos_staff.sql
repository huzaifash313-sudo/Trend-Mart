-- POS staff accounts: replaces the single shared client-side PIN with per-staff,
-- server-verified PINs so every counter action is attributable to a person.
--
-- The terminal still signs in as the shop owner; `pos_staff` identifies WHO is at
-- the counter during a shift (the Square / Loyverse model).

CREATE TABLE IF NOT EXISTS public.pos_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- scrypt hash as `scrypt$<salt>$<derived>` — never a plaintext PIN, and never
  -- returned to the client by any API route.
  pin_hash text NOT NULL,
  role text NOT NULL DEFAULT 'cashier' CHECK (role IN ('cashier', 'manager')),
  -- Deactivate instead of deleting so historical audit rows keep resolving.
  is_active boolean NOT NULL DEFAULT true,
  -- Reserved: lets a staff row later be linked to a real auth user without a
  -- schema migration, if per-staff logins are ever added.
  user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_staff_shop
  ON public.pos_staff (shop_id, is_active, name);

ALTER TABLE public.pos_staff ENABLE ROW LEVEL SECURITY;

-- Only the shop owner can manage their own staff list. PIN verification happens
-- server-side with the service role, so no client ever needs to read pin_hash.
DROP POLICY IF EXISTS pos_staff_owner_all ON public.pos_staff;
CREATE POLICY pos_staff_owner_all ON public.pos_staff
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_id = auth.uid()
    )
  );

-- Attribution columns: which staff member rang up / adjusted what.
-- staff_name is denormalized so history stays readable after a staff row is removed.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS staff_id uuid NULL REFERENCES public.pos_staff(id) ON DELETE SET NULL;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS staff_name text NULL;

ALTER TABLE public.pos_stock_moves
  ADD COLUMN IF NOT EXISTS staff_id uuid NULL REFERENCES public.pos_staff(id) ON DELETE SET NULL;
ALTER TABLE public.pos_stock_moves
  ADD COLUMN IF NOT EXISTS staff_name text NULL;
