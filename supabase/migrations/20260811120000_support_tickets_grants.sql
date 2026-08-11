-- =============================================================================
-- Support tickets: grants so anon/authenticated can INSERT (RLS still applies)
-- =============================================================================

BEGIN;

GRANT INSERT ON public.support_tickets TO anon, authenticated;
GRANT SELECT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

COMMIT;
