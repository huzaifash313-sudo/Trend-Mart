-- Email verification OTP store for the custom 6-digit signup code flow.
-- Replaces Supabase's default magic-link confirmation email. Rows are written
-- and read ONLY by the service-role key (from the /api/auth/* routes), which
-- bypasses RLS — no anon/authenticated policies are granted, so the table is
-- inaccessible to the public API. Codes are stored as an HMAC hash, never in
-- plaintext (see lib/otp.ts).

CREATE TABLE IF NOT EXISTS public.email_verification_otps (
  email        text PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_otps_user_id_idx
  ON public.email_verification_otps (user_id);

CREATE INDEX IF NOT EXISTS email_verification_otps_expires_at_idx
  ON public.email_verification_otps (expires_at);

-- Lock the table down: RLS on, and deliberately NO policies. The service-role
-- client bypasses RLS; every other role (anon, authenticated) is denied.
ALTER TABLE public.email_verification_otps ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.email_verification_otps FROM anon, authenticated;
