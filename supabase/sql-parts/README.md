# TrendMart — schema parts (fix for Failed to fetch)

`Failed to fetch (api.supabase.com)` usually means the **dashboard request timed out** or the network dropped — not always bad SQL. The full `RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql` is too heavy for one paste.

## Run order (one file at a time)

1. `01a_core_roles_shops_orders.sql`
2. `01b_core_wishlists_coupons_audit.sql`
3. `01c_core_functions_triggers_grants.sql`
4. `02_subcategories_products.sql`
5. `03_geo_chat_theme_sales.sql`
6. `04_delivery_radius.sql`
7. `05_verification_slabs.sql`
8. `06_support_legal.sql`
9. `07_promotional_ads.sql`
10. `08_user_profiles.sql`
11. `09_performance_indexes.sql`
12. `10_verify_only.sql` (optional check)

## If a part still fails

- Confirm project is **Active** (not paused)
- Re-login to supabase.com
- Chrome Incognito / disable VPN / adblock for supabase.com
- Wait 15 seconds and **re-run the same part** (scripts are idempotent)
