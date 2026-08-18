-- TrendMart — sensitive shop info change tracking.
-- Merchants may change the store name / phone numbers once per week (enforced
-- in the app + confirmed with the account password). This column records when
-- that last happened. Location and all other fields are always free.
-- Idempotent.

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS sensitive_info_updated_at timestamptz DEFAULT NULL;
