-- TrendMart: product short codes for direct, compact product deep links.
-- Each product gets an 8-char URL-safe code used in WhatsApp order messages:
--   https://<origin>/p/<short_code>
-- instead of the long `shop/{slug}#product-{uuid}` store link.

-- 1) Column + unique index ------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS short_code text;

CREATE UNIQUE INDEX IF NOT EXISTS products_short_code_key
  ON public.products (short_code)
  WHERE short_code IS NOT NULL;

-- 2) Backfill existing products that don't have a code yet -----------------
-- URL-safe base62 alphabet matches the app's `generateProductShortCode`.
DO $$
DECLARE
  r record;
  new_code text;
  alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  i int;
  collision boolean;
BEGIN
  FOR r IN SELECT id FROM public.products
           WHERE short_code IS NULL OR short_code = ''
  LOOP
    collision := true;
    WHILE collision LOOP
      new_code := '';
      FOR i IN 1..8 LOOP
        new_code := new_code
          || substr(alphabet, 1 + floor(random() * 62)::int, 1);
      END LOOP;
      SELECT EXISTS(SELECT 1 FROM public.products WHERE short_code = new_code)
        INTO collision;
    END LOOP;
    UPDATE public.products SET short_code = new_code WHERE id = r.id;
  END LOOP;
END $$;
