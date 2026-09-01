-- =============================================================================
-- TrendsMart — In-app customer ↔ merchant inquiries (realtime messaging lite)
-- =============================================================================
-- Adds customer identity, merchant replies, and RLS so buyers can read their
-- own threads while shop owners manage replies from the dashboard.
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE public.customer_inquiries
  ADD COLUMN IF NOT EXISTS customer_phone text DEFAULT '';
ALTER TABLE public.customer_inquiries
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.customer_inquiries
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
ALTER TABLE public.customer_inquiries
  ADD COLUMN IF NOT EXISTS merchant_reply text;
ALTER TABLE public.customer_inquiries
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;
ALTER TABLE public.customer_inquiries
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_inquiries_customer_user
  ON public.customer_inquiries(customer_user_id, created_at DESC)
  WHERE customer_user_id IS NOT NULL;

-- Customers may read their own inquiry threads
DROP POLICY IF EXISTS "inquiries_customer_select" ON public.customer_inquiries;
CREATE POLICY "inquiries_customer_select"
  ON public.customer_inquiries FOR SELECT
  TO authenticated
  USING (customer_user_id IS NOT NULL AND customer_user_id = auth.uid());

-- Shop owners may update (mark read, reply)
DROP POLICY IF EXISTS "inquiries_owner_update" ON public.customer_inquiries;
CREATE POLICY "inquiries_owner_update"
  ON public.customer_inquiries FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

COMMIT;
