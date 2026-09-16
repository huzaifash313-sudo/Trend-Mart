-- Native push device tokens (FCM) — mirrors push_subscriptions RLS pattern,
-- separate table because these are OS-level tokens, not Web Push subscriptions.

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_id_idx
  ON public.device_push_tokens (user_id);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_push_tokens_select_own" ON public.device_push_tokens;
CREATE POLICY "device_push_tokens_select_own"
  ON public.device_push_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_push_tokens_insert_own" ON public.device_push_tokens;
CREATE POLICY "device_push_tokens_insert_own"
  ON public.device_push_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_push_tokens_update_own" ON public.device_push_tokens;
CREATE POLICY "device_push_tokens_update_own"
  ON public.device_push_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "device_push_tokens_delete_own" ON public.device_push_tokens;
CREATE POLICY "device_push_tokens_delete_own"
  ON public.device_push_tokens FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_push_tokens TO authenticated;

NOTIFY pgrst, 'reload schema';
