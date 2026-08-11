-- Fix: user_roles PostgREST 500 (infinite recursion in RLS policy)
-- Run this in Supabase SQL Editor if /rest/v1/user_roles returns 500.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_insert_own" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_update_own" ON public.user_roles;

CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_roles_admin_all"
  ON public.user_roles FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "user_roles_insert_own"
  ON public.user_roles FOR INSERT
  WITH CHECK (auth.uid() = user_id AND role <> 'admin');

CREATE POLICY "user_roles_update_own"
  ON public.user_roles FOR UPDATE
  USING (auth.uid() = user_id AND role <> 'admin')
  WITH CHECK (auth.uid() = user_id AND role <> 'admin');

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role::text
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

COMMIT;
