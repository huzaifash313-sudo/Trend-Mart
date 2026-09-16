-- Shop-scoped POS audit trail: who discounted, who overrode a price, who voided.
--
-- Deliberately separate from `admin_audit_logs` (which is platform-admin only and
-- unreadable by merchants). The trust property here comes from the RLS split:
-- the owner can READ their shop's history, but INSERT/UPDATE/DELETE are reserved
-- for the service role, so a cashier can neither forge nor erase entries.

CREATE TABLE IF NOT EXISTS public.pos_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  staff_id uuid NULL REFERENCES public.pos_staff(id) ON DELETE SET NULL,
  -- Denormalized so the log stays meaningful after a staff member is removed.
  staff_name text NULL,
  -- e.g. sale.completed | sale.discount | sale.price_override | sale.void
  --      staff.login | staff.created | staff.pin_reset | staff.deactivated
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pos_audit_shop_created
  ON public.pos_audit_logs (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_audit_shop_event
  ON public.pos_audit_logs (shop_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pos_audit_staff
  ON public.pos_audit_logs (staff_id, created_at DESC);

ALTER TABLE public.pos_audit_logs ENABLE ROW LEVEL SECURITY;

-- Read-only for the shop owner. No client-side INSERT/UPDATE/DELETE policy is
-- defined on purpose: writes go through server routes using the service role,
-- which bypasses RLS. That is what makes this log tamper-evident.
DROP POLICY IF EXISTS pos_audit_owner_select ON public.pos_audit_logs;
CREATE POLICY pos_audit_owner_select ON public.pos_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shops s
      WHERE s.id = shop_id AND s.owner_id = auth.uid()
    )
  );
