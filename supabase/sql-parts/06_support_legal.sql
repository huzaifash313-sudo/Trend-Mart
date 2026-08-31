-- TrendsMart SQL part file — run in order in Supabase SQL Editor
-- If 'Failed to fetch (api.supabase.com)' appears: wait 10s, re-run THIS part only, or try another browser / disable VPN.

-- #############################################################################
-- PART 6 — SUPPORT DESK + LEGAL ACCEPTANCE AUDIT TRAIL
-- #############################################################################

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'general'
                CHECK (category IN ('general', 'order', 'merchant', 'technical', 'billing', 'other')),
  subject       TEXT NOT NULL,
  message       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  admin_notes   TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safety net: backfill any columns missing from an older/partial "support_tickets" table.
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS admin_notes TEXT DEFAULT '';
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_public_insert" ON public.support_tickets;
CREATE POLICY "support_tickets_public_insert"
  ON public.support_tickets FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "support_tickets_own_read" ON public.support_tickets;
CREATE POLICY "support_tickets_own_read"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "support_tickets_admin_all" ON public.support_tickets;
CREATE POLICY "support_tickets_admin_all"
  ON public.support_tickets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_support_tickets_updated_at'
  ) THEN
    CREATE TRIGGER trg_support_tickets_updated_at
      BEFORE UPDATE ON public.support_tickets
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  document      TEXT NOT NULL CHECK (document IN ('terms', 'privacy', 'merchant_guidelines')),
  version       TEXT NOT NULL DEFAULT 'v1',
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hint       TEXT DEFAULT ''
);

-- Safety net: backfill any columns missing from an older/partial "legal_acceptances" table.
ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.legal_acceptances ADD COLUMN IF NOT EXISTS ip_hint TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_id ON public.legal_acceptances(user_id);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_acceptances_own_insert" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_own_insert"
  ON public.legal_acceptances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "legal_acceptances_own_read" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_own_read"
  ON public.legal_acceptances FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "legal_acceptances_admin_read" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_admin_read"
  ON public.legal_acceptances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Table-level grants — REQUIRED for PostgREST. RLS policies alone are not
-- enough: without grants every REST request returns 404 before RLS runs.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legal_acceptances TO authenticated;
GRANT SELECT ON public.legal_acceptances TO anon;

COMMIT;
