-- TrendMart SQL part file — run in order in Supabase SQL Editor
-- If 'Failed to fetch (api.supabase.com)' appears: wait 10s, re-run THIS part only, or try another browser / disable VPN.

-- #############################################################################
-- ✅ DONE — verification helper queries (read-only, safe to run any time)
-- #############################################################################

DO $$
DECLARE
  missing_rls text;
  table_count integer;
BEGIN
  SELECT count(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'shops','products','orders','reviews','stories','coupons',
      'customer_inquiries','analytics_logs','security_audit_log',
      'inventory_variants','customer_wishlists','favorite_stores',
      'leads','finance_entries','customer_addresses','user_roles',
      'merchant_subscriptions','billing_invoices','subscription_audit_log',
      'admin_audit_logs','service_packages','service_portfolio','service_availability',
      'sub_categories','sales_events','daily_revenue_snapshots','chat_logs',
      'merchant_theme_preferences','support_tickets','legal_acceptances',
      'promotional_ads','user_profiles'
    );

  SELECT string_agg(tablename, ', ') INTO missing_rls
  FROM pg_tables
  WHERE schemaname = 'public'
    AND rowsecurity = false
    AND tablename IN (
      'shops','products','orders','reviews','stories','coupons',
      'customer_inquiries','analytics_logs','security_audit_log',
      'inventory_variants','customer_wishlists','favorite_stores',
      'leads','finance_entries','customer_addresses','user_roles',
      'merchant_subscriptions','billing_invoices','subscription_audit_log',
      'admin_audit_logs','service_packages','service_portfolio','service_availability',
      'sub_categories','sales_events','daily_revenue_snapshots','chat_logs',
      'merchant_theme_preferences','support_tickets','legal_acceptances',
      'promotional_ads','user_profiles'
    );

  RAISE NOTICE '✅ TrendMart database setup complete! % / 30 expected tables exist.', table_count;

  IF missing_rls IS NOT NULL THEN
    RAISE WARNING '⚠️ The following tables have RLS DISABLED: %', missing_rls;
  ELSE
    RAISE NOTICE '✅ All tables have Row Level Security enabled.';
  END IF;
END $$;

-- To make your OWN Supabase account a Super-Admin (so you can access
-- /admin/dashboard), run this once after signing up in the app, replacing
-- the email with your own account's email:
--
--   UPDATE public.user_roles SET role = 'admin'
--   WHERE user_id = (SELECT id FROM auth.users WHERE email = 'you@example.com');
 
