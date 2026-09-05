-- =============================================================================
-- TrendsMart — FIX: Admin bounced off /admin/dashboard  (user_roles RLS recursion)
-- =============================================================================
-- SYMPTOM
--   Admin login succeeds but /admin/dashboard immediately redirects away
--   (usually to /dashboard). Browser console shows:
--     "infinite recursion detected in policy for relation user_roles"
--
-- WHY IT HAPPENS
--   Some history of overlapping migration files left a policy on public.user_roles
--   that reads public.user_roles inside its own USING clause WITHOUT the
--   SECURITY DEFINER helper. Postgres detects the self-referential loop and
--   aborts EVERY direct query to user_roles from the client. The /admin pages
--   gate on that exact query, so it returns no row → "not admin" → bounce.
--
-- WHAT THIS FIX DOES  (safe to re-run)
--   1) Drops EVERY policy currently on public.user_roles (any name — legacy
--      files used several). No more recursion.
--   2) Recreates public.is_admin() as SECURITY DEFINER — it runs as the table
--      owner, bypasses RLS, so policies calling it can never recurse.
--   3) Recreates the canonical, recursion-proof policy set:
--        • user_roles_select_own  → users read their own role
--        • user_roles_admin_all   → admins manage all rows (via is_admin())
--        • user_roles_insert_own  → signup fallback for customer/merchant
--        • user_roles_update_own  → merchant-promotion fallback (never admin)
--
-- HOW TO RUN
--   Supabase → SQL Editor → paste → RUN   (as postgres, no special role needed)
-- =============================================================================

-- ── 1) Remove every existing policy on user_roles (kills the recursion) ─────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.user_roles'::regclass
  LOOP
    EXECUTE format('DROP POLICY %I ON public.user_roles', pol.polname);
    RAISE NOTICE 'Dropped policy %', pol.polname;
  END LOOP;
END $$;

-- Also drop the known legacy names explicitly (in case the loop above runs on
-- an older Postgres where pg_policy visibility differs).
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_upsert_own" ON public.user_roles;

-- ── 2) is_admin() — SECURITY DEFINER = recursion-proof, authoratative ───────
--   Honours BOTH a user_roles row AND service-role-written app_metadata.role
--   (same intent as the latest migration). user_metadata is deliberately
--   ignored — it is user-editable and must never confer admin.
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_user_id AND role = 'admin'
    )
    OR (
      p_user_id = auth.uid()
      AND coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;

-- ── 3) Canonical recursion-proof policy set ─────────────────────────────────
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can always read their own role row.
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can manage every role row — resolved through the SECURITY DEFINER
-- helper so this never re-enters user_roles policies.
CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- A signed-in user may insert their own role row only when the
-- handle_new_user trigger missed it — and never as 'admin'.
CREATE POLICY "user_roles_insert_own"
  ON public.user_roles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role <> 'admin');

-- A signed-in user may self-promote customer → merchant only; never to/from
-- 'admin' (admin changes go through the service role / admin policy above).
CREATE POLICY "user_roles_update_own"
  ON public.user_roles FOR UPDATE
  USING (auth.uid() = user_id AND role <> 'admin')
  WITH CHECK (auth.uid() = user_id AND role <> 'admin');

-- ── 4) Sanity check: the fix is good when this list is exactly the 4 above ──
SELECT
  polname        AS policy,
  polcmd         AS command,     -- r = SELECT, a = INSERT, w = UPDATE, d = DELETE, * = ALL
  pg_get_expr(polqual, polrelid) AS using_expression
FROM pg_policy
WHERE polrelid = 'public.user_roles'::regclass
ORDER BY polname;
