-- =============================================================================
-- TrendMart — Multi-Vendor Commission & Subscription Tier Management Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_subscriptions (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id             uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  tier                text NOT NULL DEFAULT 'free_trial',
  status              text NOT NULL DEFAULT 'active',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end   timestamptz NOT NULL,
  trial_started_at    timestamptz,
  trial_ends_at       timestamptz,
  products_used       integer NOT NULL DEFAULT 0,
  storage_used_mb     numeric(10,2) NOT NULL DEFAULT 0,
  grace_period_until  timestamptz,
  suspended_at        timestamptz,
  suspended_reason    text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE(shop_id)
);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id         uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.merchant_subscriptions(id) ON DELETE CASCADE,
  amount_pkr      integer NOT NULL DEFAULT 0,
  commission_pkr  integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending',
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  due_date        timestamptz NOT NULL,
  paid_at         timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_audit_log (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id           uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  subscription_id   uuid REFERENCES public.merchant_subscriptions(id) ON DELETE SET NULL,
  event_type        text NOT NULL,
  old_value          jsonb,
  new_value          jsonb,
  performed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address        text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_merchant_subs_shop ON public.merchant_subscriptions(shop_id);
CREATE INDEX IF NOT EXISTS idx_merchant_subs_status ON public.merchant_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_shop ON public.billing_invoices(shop_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status ON public.billing_invoices(status);
CREATE INDEX IF NOT EXISTS idx_sub_audit_shop ON public.subscription_audit_log(shop_id);

ALTER TABLE public.merchant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS: Shop owners can read their own subscription
CREATE POLICY "subs_owner_read"
  ON public.merchant_subscriptions FOR SELECT
  USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));

-- RLS: Admins can read all subscriptions
CREATE POLICY "subs_admin_read"
  ON public.merchant_subscriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS: Admins can update subscriptions
CREATE POLICY "subs_admin_update"
  ON public.merchant_subscriptions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS: Shop owners can read their own invoices
CREATE POLICY "invoices_owner_read"
  ON public.billing_invoices FOR SELECT
  USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));

-- RLS: Admins can read all invoices
CREATE POLICY "invoices_admin_read"
  ON public.billing_invoices FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS: Audit log - admins can read all; shop owners can read their own
CREATE POLICY "audit_admin_read"
  ON public.subscription_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "audit_owner_read"
  ON public.subscription_audit_log FOR SELECT
  USING (auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id));