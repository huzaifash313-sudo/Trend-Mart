-- =============================================================================
-- TrendsMart — Customer Inquiry & Direct Chat Lead Table
-- Captures metadata on every WhatsApp inquiry / booking button click.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.leads (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id           uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_phone    text NOT NULL DEFAULT '',
  customer_name     text DEFAULT '',
  product_id        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  service_context   text DEFAULT '',
  source            text NOT NULL DEFAULT 'whatsapp',  -- 'whatsapp', 'inquiry_form', 'booking_button'
  is_converted      boolean NOT NULL DEFAULT false,     -- Store owner marks as followed-up
  followed_up_at    timestamptz,
  notes             text DEFAULT '',
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_shop_id ON public.leads(shop_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_converted ON public.leads(shop_id, is_converted);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Public: anyone can insert a lead (fired automatically on WhatsApp/booking click)
CREATE POLICY "leads_public_insert"
  ON public.leads FOR INSERT
  WITH CHECK (true);

-- Owner: shop owner can read/update/delete their leads
CREATE POLICY "leads_owner_read"
  ON public.leads FOR SELECT
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

CREATE POLICY "leads_owner_update"
  ON public.leads FOR UPDATE
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

CREATE POLICY "leads_owner_delete"
  ON public.leads FOR DELETE
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );