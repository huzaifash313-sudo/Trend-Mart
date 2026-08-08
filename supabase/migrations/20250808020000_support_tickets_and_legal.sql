/* -------------------------------------------------------------------------- */
/*  TrendMart — Platform Support Desk & Legal Acceptance Tracking              */
/*                                                                             */
/*  Adds:                                                                     */
/*   1. support_tickets table — platform-wide contact/support inbox           */
/*      (distinct from per-shop `customer_inquiries`)                        */
/*   2. legal_acceptances table — audit trail of T&C / Privacy Policy /      */
/*      Merchant Security Guidelines sign-off per user                       */
/*   3. RLS policies (public insert for tickets, admin-only read/manage)      */
/* -------------------------------------------------------------------------- */

-- ============================================================================
-- 1. SUPPORT TICKETS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Nullable: guests can submit tickets without an account
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

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_category ON public.support_tickets(category);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

-- Anyone (including guests, via anon key) can open a support ticket
DROP POLICY IF EXISTS "support_tickets_public_insert" ON public.support_tickets;
CREATE POLICY "support_tickets_public_insert"
  ON public.support_tickets FOR INSERT
  WITH CHECK (true);

-- Authenticated users can read their own submitted tickets
DROP POLICY IF EXISTS "support_tickets_own_read" ON public.support_tickets;
CREATE POLICY "support_tickets_own_read"
  ON public.support_tickets FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read, update, and manage all tickets
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

-- ============================================================================
-- 2. LEGAL ACCEPTANCE AUDIT TRAIL
-- ============================================================================
-- Records that a user explicitly agreed to the required legal documents at
-- registration time (Terms & Conditions, Privacy Policy, and — for merchants —
-- the Merchant Security Guidelines). Kept as an append-only audit log.

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id            UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Snapshot of what was agreed to, in case documents change over time
  document      TEXT NOT NULL CHECK (document IN ('terms', 'privacy', 'merchant_guidelines')),
  version       TEXT NOT NULL DEFAULT 'v1',
  accepted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hint       TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptances_user_id ON public.legal_acceptances(user_id);

ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Users can insert their own acceptance record at signup/registration
DROP POLICY IF EXISTS "legal_acceptances_own_insert" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_own_insert"
  ON public.legal_acceptances FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own acceptance history
DROP POLICY IF EXISTS "legal_acceptances_own_read" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_own_read"
  ON public.legal_acceptances FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all acceptance records (compliance audits)
DROP POLICY IF EXISTS "legal_acceptances_admin_read" ON public.legal_acceptances;
CREATE POLICY "legal_acceptances_admin_read"
  ON public.legal_acceptances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
