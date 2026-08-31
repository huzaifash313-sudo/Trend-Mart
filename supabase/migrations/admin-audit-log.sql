-- =============================================================================
-- TrendsMart — Enterprise-Grade Audit Logging & Admin Activity Tracker
-- Centralized platform audit log for super administrators.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type      text NOT NULL,
  target_type     text NOT NULL,       -- 'shop', 'user', 'order', 'subscription', 'product', 'system'
  target_id       uuid,
  description     text NOT NULL,
  old_value       jsonb,
  new_value       jsonb,
  performed_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_email text,
  ip_address      text,
  user_agent      text,
  severity        text NOT NULL DEFAULT 'info', -- 'info', 'warning', 'critical'
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_event_type ON public.admin_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_target ON public.admin_audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_performed_by ON public.admin_audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_severity ON public.admin_audit_logs(severity);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Only admins can read audit logs
CREATE POLICY "audit_admin_select"
  ON public.admin_audit_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS: System can insert (via service role) and admins can insert
CREATE POLICY "audit_admin_insert"
  ON public.admin_audit_logs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));