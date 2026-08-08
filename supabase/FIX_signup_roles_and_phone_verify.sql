-- =============================================================================
-- Signup roles + phone verification persistence
-- =============================================================================
-- 1) handle_new_user reads signup role from auth metadata (customer|merchant)
-- 2) set_my_signup_role() RPC so the app can claim the chosen role
-- 3) user_profiles.phone_verified_at — checkout skips OTP for that phone
--
-- Paste into Supabase → SQL Editor → Run once. Safe to re-run.
-- =============================================================================

-- Phone verified once → never re-prompt for same number at checkout
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz DEFAULT NULL;

-- New users: honour the role chosen on the signup form (user_metadata.role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  chosen text;
  resolved public.app_role;
BEGIN
  chosen := lower(coalesce(NEW.raw_user_meta_data->>'role', 'customer'));
  IF chosen = 'merchant' THEN
    resolved := 'merchant';
  ELSE
    resolved := 'customer';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, resolved)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Client-callable: set role at signup / "Become a Merchant"
CREATE OR REPLACE FUNCTION public.set_my_signup_role(desired_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  next_role public.app_role;
  current_role text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF lower(desired_role) = 'merchant' THEN
    next_role := 'merchant';
  ELSIF lower(desired_role) = 'customer' THEN
    next_role := 'customer';
  ELSE
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT role::text INTO current_role
  FROM public.user_roles
  WHERE user_id = uid;

  -- Never overwrite admin
  IF current_role = 'admin' THEN
    RETURN;
  END IF;

  -- Allow customer → merchant (sell upgrade). Merchant → customer only if no shops.
  IF next_role = 'customer' AND current_role = 'merchant' THEN
    IF EXISTS (SELECT 1 FROM public.shops WHERE owner_id = uid LIMIT 1) THEN
      RAISE EXCEPTION 'Cannot downgrade while you own a store';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, next_role)
  ON CONFLICT (user_id)
  DO UPDATE SET role = EXCLUDED.role, updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_signup_role(text) TO authenticated;

-- Allow owners to upsert their own role row as a fallback (RPC is preferred)
DROP POLICY IF EXISTS "user_roles_upsert_own" ON public.user_roles;
CREATE POLICY "user_roles_upsert_own"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND role IN ('customer', 'merchant')
  );

DROP POLICY IF EXISTS "user_roles_update_own" ON public.user_roles;
CREATE POLICY "user_roles_update_own"
  ON public.user_roles FOR UPDATE
  USING (auth.uid() = user_id AND role IN ('customer', 'merchant'))
  WITH CHECK (
    auth.uid() = user_id
    AND role IN ('customer', 'merchant')
  );
