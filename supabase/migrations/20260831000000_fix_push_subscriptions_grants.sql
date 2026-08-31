-- Fix push_subscriptions REST permissions (POST /api/push/subscribe 500).
-- Table + RLS existed but authenticated role lacked table-level GRANTs.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

-- Endpoint is globally unique; ensure upsert onConflict works even on older DBs.
DO $$
BEGIN
  IF to_regclass('public.push_subscriptions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.push_subscriptions'::regclass
         AND conname = 'push_subscriptions_endpoint_key'
     ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
