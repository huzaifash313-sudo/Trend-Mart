-- Platform brand theme (admin 1-click UI color presets)
-- Public read so every visitor gets the published theme; admin-only write.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_settings (key, value) VALUES
  ('brand_theme', jsonb_build_object('id', 'green'))
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_public_read ON public.platform_settings;
CREATE POLICY platform_settings_public_read
  ON public.platform_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS platform_settings_admin_write ON public.platform_settings;
CREATE POLICY platform_settings_admin_write
  ON public.platform_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;
