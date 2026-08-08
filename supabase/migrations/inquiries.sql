-- =============================================================================
-- TrendMart — Customer Inquiry / Chat History Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.customer_inquiries (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id       uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_name text DEFAULT '',
  message       text NOT NULL DEFAULT '',
  product_id    uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_shop_id ON public.customer_inquiries(shop_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON public.customer_inquiries(created_at DESC);

ALTER TABLE public.customer_inquiries ENABLE ROW LEVEL SECURITY;

-- Public: anyone can insert an inquiry
CREATE POLICY "inquiries_public_insert"
  ON public.customer_inquiries FOR INSERT
  WITH CHECK (true);

-- Owner: shop owner can read their inquiries
CREATE POLICY "inquiries_owner_read"
  ON public.customer_inquiries FOR SELECT
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- Owner: shop owner can delete inquiries
CREATE POLICY "inquiries_owner_delete"
  ON public.customer_inquiries FOR DELETE
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );