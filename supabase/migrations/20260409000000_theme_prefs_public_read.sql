-- Allow anyone to read merchant storefront display prefs (banner / WhatsApp float).
-- Sensitive merchant-only writes remain owner-scoped via existing FOR ALL policy.

DROP POLICY IF EXISTS "Public can read theme preferences" ON public.merchant_theme_preferences;
CREATE POLICY "Public can read theme preferences"
ON public.merchant_theme_preferences
FOR SELECT
USING (true);
