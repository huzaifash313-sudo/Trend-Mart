-- TrendMart — sensitive shop info change tracking.
-- Merchants may change name / phone / location once per month (enforced in the
-- app + optionally with a password). This column records when that last
-- happened. Idempotent.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS sensitive_info_updated_at timestamptz DEFAULT NULL;
