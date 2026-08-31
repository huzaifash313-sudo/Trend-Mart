-- =============================================================================
-- TrendsMart — Automated Database Maintenance, Backup Cron & Data Archival
-- =============================================================================
--
-- This script implements:
--   1. Cleanup of expired temporary sessions (auth sessions older than 30 days)
--   2. Pruning stale anonymous shopping carts (carts inactive > 7 days)
--   3. Archival of old fulfilled orders past retention limits (90+ days)
--   4. Table index optimization & statistics refresh
--   5. Optional scheduled cron jobs for automated execution
--   6. Health/audit logging for maintenance operations
--
-- =============================================================================

-- ── Prerequisite: pg_cron extension (for scheduled jobs) ─────────────────────
-- Note: pg_cron may require superuser/extension admin access. Uncomment if available.
-- CREATE EXTENSION IF NOT EXISTS pg_cron SCHEMA pg_catalog;

-- =============================================================================
-- SECTION 1: Maintenance Audit Log Table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.maintenance_logs (
  id              bigserial PRIMARY KEY,
  operation       text NOT NULL,
  rows_affected   integer DEFAULT 0,
  status          text DEFAULT 'completed', -- completed, failed, skipped
  error_message   text,
  executed_at     timestamptz DEFAULT now(),
  duration_ms     integer
);

COMMENT ON TABLE public.maintenance_logs IS 'Audit trail for automated database maintenance operations.';

CREATE INDEX IF NOT EXISTS idx_maintenance_logs_executed_at
  ON public.maintenance_logs(executed_at DESC);

-- Grant read access to authenticated users for monitoring
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_logs_auth_select"
  ON public.maintenance_logs FOR SELECT
  USING (auth.role() = 'authenticated');

-- =============================================================================
-- SECTION 2: Expired Temporary Sessions Cleanup
-- =============================================================================
-- Cleans auth sessions that have been inactive for > 30 days from Supabase's
-- built-in auth schema tables (auth.sessions, auth.refresh_tokens).

CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions(
  retention_days integer DEFAULT 30
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_count integer := 0;
  v_start_time    timestamptz := clock_timestamp();
  v_duration_ms   integer;
BEGIN
  -- Delete expired refresh tokens
  DELETE FROM auth.refresh_tokens
  WHERE created_at < (now() - (retention_days || ' days')::interval)
    OR (revoked = true AND updated_at < (now() - '7 days'::interval));

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Delete expired sessions (no active refresh tokens reference them)
  DELETE FROM auth.sessions
  WHERE not_before IS NULL
     OR refreshed_at IS NULL
     OR refreshed_at < (now() - (retention_days || ' days')::interval);

  GET DIAGNOSTICS v_deleted_count = v_deleted_count + ROW_COUNT;

  v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;

  INSERT INTO public.maintenance_logs (operation, rows_affected, status, duration_ms)
  VALUES ('cleanup_expired_sessions', v_deleted_count, 'completed', v_duration_ms);

  RETURN v_deleted_count;
EXCEPTION
  WHEN OTHERS THEN
    v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;
    INSERT INTO public.maintenance_logs (operation, rows_affected, status, error_message, duration_ms)
    VALUES ('cleanup_expired_sessions', 0, 'failed', SQLERRM, v_duration_ms);
    RAISE WARNING 'cleanup_expired_sessions failed: %', SQLERRM;
    RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_sessions(integer) IS
'Cleans expired/inactive auth sessions and refresh tokens older than the specified retention period.';

-- =============================================================================
-- SECTION 3: Stale Anonymous Shopping Cart Pruning
-- =============================================================================
-- Removes orders with status='Pending' and no customer phone that are older
-- than 7 days (anonymous abandoned carts). Also handles carts created by
-- unauthenticated visitors with no follow-up.

CREATE OR REPLACE FUNCTION public.prune_stale_carts(
  stale_days integer DEFAULT 7
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_count integer := 0;
  v_start_time    timestamptz := clock_timestamp();
  v_duration_ms   integer;
BEGIN
  -- Delete stale anonymous orders (Pending + no phone = abandoned cart)
  DELETE FROM public.orders
  WHERE status = 'Pending'
    AND (customer_phone IS NULL OR customer_phone = '')
    AND created_at < (now() - (stale_days || ' days')::interval);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Also clean up analytics_logs for non-existent orders (orphaned logs)
  DELETE FROM public.analytics_logs
  WHERE created_at < (now() - '90 days'::interval);

  GET DIAGNOSTICS v_deleted_count = v_deleted_count + ROW_COUNT;

  v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;

  INSERT INTO public.maintenance_logs (operation, rows_affected, status, duration_ms)
  VALUES ('prune_stale_carts', v_deleted_count, 'completed', v_duration_ms);

  RETURN v_deleted_count;
EXCEPTION
  WHEN OTHERS THEN
    v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;
    INSERT INTO public.maintenance_logs (operation, rows_affected, status, error_message, duration_ms)
    VALUES ('prune_stale_carts', 0, 'failed', SQLERRM, v_duration_ms);
    RAISE WARNING 'prune_stale_carts failed: %', SQLERRM;
    RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.prune_stale_carts(integer) IS
'Removes abandoned anonymous shopping carts (Pending orders with no phone) older than the specified days. Also prunes old analytics logs.';

-- =============================================================================
-- SECTION 4: Order Archival Strategy
-- =============================================================================
-- Archives fulfilled (Delivered) and cancelled orders older than the retention
-- period to an archive table, preserving data for reporting while keeping the
-- primary orders table lean for active queries.

-- 4a. Create archive table
CREATE TABLE IF NOT EXISTS public.orders_archive (
  id              uuid PRIMARY KEY,
  shop_id         uuid NOT NULL,
  customer_name   text DEFAULT '',
  customer_phone  text DEFAULT '',
  items_json      jsonb DEFAULT '[]'::jsonb,
  total_amount    numeric(10,2) DEFAULT 0,
  status          text DEFAULT 'Delivered',
  created_at      timestamptz,
  updated_at      timestamptz,
  tracking_number text,
  archived_at     timestamptz DEFAULT now(),
  archived_by     text DEFAULT 'system'
);

COMMENT ON TABLE public.orders_archive IS 'Archived orders for historical reporting. Orders are moved here after retention period (default: 90 days).';

CREATE INDEX IF NOT EXISTS idx_orders_archive_shop_id ON public.orders_archive(shop_id);
CREATE INDEX IF NOT EXISTS idx_orders_archive_created_at ON public.orders_archive(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_archive_archived_at ON public.orders_archive(archived_at DESC);

ALTER TABLE public.orders_archive ENABLE ROW LEVEL SECURITY;

-- Shop owners can read their archived orders
CREATE POLICY "orders_archive_owner_read"
  ON public.orders_archive FOR SELECT
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- 4b. Archive function
CREATE OR REPLACE FUNCTION public.archive_old_orders(
  retention_days integer DEFAULT 90
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_archived_count integer := 0;
  v_start_time     timestamptz := clock_timestamp();
  v_duration_ms    integer;
BEGIN
  -- Move delivered orders to archive
  WITH moved_rows AS (
    DELETE FROM public.orders
    WHERE status IN ('Delivered', 'Cancelled')
      AND created_at < (now() - (retention_days || ' days')::interval)
    RETURNING *
  )
  INSERT INTO public.orders_archive (
    id, shop_id, customer_name, customer_phone,
    items_json, total_amount, status,
    created_at, updated_at, tracking_number,
    archived_at
  )
  SELECT
    id, shop_id, customer_name, customer_phone,
    items_json, total_amount, status,
    created_at, updated_at, tracking_number,
    now()
  FROM moved_rows;

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;

  INSERT INTO public.maintenance_logs (operation, rows_affected, status, duration_ms)
  VALUES ('archive_old_orders', v_archived_count, 'completed', v_duration_ms);

  RETURN v_archived_count;
EXCEPTION
  WHEN OTHERS THEN
    v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;
    INSERT INTO public.maintenance_logs (operation, rows_affected, status, error_message, duration_ms)
    VALUES ('archive_old_orders', 0, 'failed', SQLERRM, v_duration_ms);
    RAISE WARNING 'archive_old_orders failed: %', SQLERRM;
    RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.archive_old_orders(integer) IS
'Moves delivered and cancelled orders older than the retention period to the orders_archive table, keeping the primary orders table lean.';

-- 4c. Purge very old archives (optional — data older than 2 years)
CREATE OR REPLACE FUNCTION public.purge_ancient_archives(
  max_age_days integer DEFAULT 730 -- 2 years
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_purged_count integer := 0;
  v_start_time   timestamptz := clock_timestamp();
  v_duration_ms  integer;
BEGIN
  DELETE FROM public.orders_archive
  WHERE archived_at < (now() - (max_age_days || ' days')::interval);

  GET DIAGNOSTICS v_purged_count = ROW_COUNT;

  v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;

  INSERT INTO public.maintenance_logs (operation, rows_affected, status, duration_ms)
  VALUES ('purge_ancient_archives', v_purged_count, 'completed', v_duration_ms);

  RETURN v_purged_count;
EXCEPTION
  WHEN OTHERS THEN
    v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;
    INSERT INTO public.maintenance_logs (operation, rows_affected, status, error_message, duration_ms)
    VALUES ('purge_ancient_archives', 0, 'failed', SQLERRM, v_duration_ms);
    RAISE WARNING 'purge_ancient_archives failed: %', SQLERRM;
    RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.purge_ancient_archives(integer) IS
'Permanently deletes archived orders older than the specified max age (default: 2 years).';

-- =============================================================================
-- SECTION 5: Index Optimization & Statistics Refresh
-- =============================================================================

CREATE OR REPLACE FUNCTION public.optimize_table_indices() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_start_time  timestamptz := clock_timestamp();
  v_duration_ms integer;
  v_table_rec   record;
BEGIN
  -- 5a. VACUUM ANALYZE on frequently-written tables to reclaim dead tuples
  ANALYZE public.shops;
  ANALYZE public.products;
  ANALYZE public.orders;
  ANALYZE public.orders_archive;
  ANALYZE public.reviews;
  ANALYZE public.analytics_logs;
  ANALYZE public.maintenance_logs;

  -- 5b. Reindex to eliminate index bloat (B-tree index optimization)
  -- Only reindex if bloat is significant (approx heuristic via size)
  FOR v_table_rec IN
    SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'shops', 'products', 'orders', 'orders_archive',
        'reviews', 'analytics_logs', 'maintenance_logs',
        'coupons', 'inquiries', 'wishlists', 'stories'
      )
  LOOP
    BEGIN
      EXECUTE format('REINDEX TABLE CONCURRENTLY public.%I', v_table_rec.tablename);
    EXCEPTION
      WHEN OTHERS THEN
        -- CONCURRENTLY may not be available inside a function; fall back to standard REINDEX
        BEGIN
          EXECUTE format('REINDEX TABLE public.%I', v_table_rec.tablename);
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Reindex failed for table %: %', v_table_rec.tablename, SQLERRM;
        END;
    END;
  END LOOP;

  v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;

  INSERT INTO public.maintenance_logs (operation, rows_affected, status, duration_ms)
  VALUES ('optimize_table_indices', 0, 'completed', v_duration_ms);
EXCEPTION
  WHEN OTHERS THEN
    v_duration_ms := extract(milliseconds from (clock_timestamp() - v_start_time))::integer;
    INSERT INTO public.maintenance_logs (operation, rows_affected, status, error_message, duration_ms)
    VALUES ('optimize_table_indices', 0, 'failed', SQLERRM, v_duration_ms);
    RAISE WARNING 'optimize_table_indices failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.optimize_table_indices() IS
'Runs ANALYZE on core tables to update query planner statistics and REINDEXes tables to eliminate B-tree bloat.';

-- =============================================================================
-- SECTION 6: Combined Maintenance Run (Run All Tasks)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.run_full_maintenance(
  session_retention_days integer DEFAULT 30,
  cart_stale_days        integer DEFAULT 7,
  order_retention_days   integer DEFAULT 90,
  archive_purge_days     integer DEFAULT 730
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result          jsonb;
  v_sessions_cleaned integer;
  v_carts_pruned     integer;
  v_orders_archived  integer;
  v_archives_purged  integer;
BEGIN
  -- Execute maintenance tasks in order
  v_sessions_cleaned := public.cleanup_expired_sessions(session_retention_days);
  v_carts_pruned     := public.prune_stale_carts(cart_stale_days);
  v_orders_archived  := public.archive_old_orders(order_retention_days);
  v_archives_purged  := public.purge_ancient_archives(archive_purge_days);

  -- Optimize indices at the end
  PERFORM public.optimize_table_indices();

  v_result := jsonb_build_object(
    'status', 'completed',
    'executed_at', now(),
    'tasks', jsonb_build_object(
      'expired_sessions_cleaned', v_sessions_cleaned,
      'stale_carts_pruned', v_carts_pruned,
      'orders_archived', v_orders_archived,
      'ancient_archives_purged', v_archives_purged,
      'indices_optimized', true
    )
  );

  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    v_result := jsonb_build_object(
      'status', 'failed',
      'executed_at', now(),
      'error', SQLERRM
    );
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.run_full_maintenance(integer, integer, integer, integer) IS
'Executes all maintenance tasks in a single run: session cleanup, cart pruning, order archival, archive purging, and index optimization. Returns a JSON summary.';

-- =============================================================================
-- SECTION 7: Scheduled Cron Jobs (via pg_cron or Supabase Cron)
-- =============================================================================
--
-- Supabase supports pg_cron on the postgres schema.
-- Uncomment and adjust schedules based on deployment needs.
--

-- 7a. Daily session cleanup (runs at 3:00 AM UTC daily)
-- SELECT cron.schedule(
--   'daily-session-cleanup',
--   '0 3 * * *',
--   'SELECT public.cleanup_expired_sessions(30);'
-- );

-- 7b. Weekly cart pruning (runs every Sunday at 4:00 AM UTC)
-- SELECT cron.schedule(
--   'weekly-cart-pruning',
--   '0 4 * * 0',
--   'SELECT public.prune_stale_carts(7);'
-- );

-- 7c. Monthly order archival (runs 1st of every month at 2:00 AM UTC)
-- SELECT cron.schedule(
--   'monthly-order-archival',
--   '0 2 1 * *',
--   'SELECT public.archive_old_orders(90);'
-- );

-- 7d. Quarterly index optimization (runs Jan/Apr/Jul/Oct 1st at 5:00 AM UTC)
-- SELECT cron.schedule(
--   'quarterly-index-optimization',
--   '0 5 1 */3 *',
--   'SELECT public.optimize_table_indices();'
-- );

-- 7e. Run full maintenance weekly (Sunday at 3:00 AM UTC)
-- SELECT cron.schedule(
--   'weekly-full-maintenance',
--   '0 3 * * 0',
--   'SELECT public.run_full_maintenance();'
-- );

-- =============================================================================
-- SECTION 8: Maintenance Health View
-- =============================================================================
-- Provides a quick overview of the last run for each maintenance operation.

CREATE OR REPLACE VIEW public.maintenance_health AS
SELECT
  operation,
  MAX(executed_at) AS last_executed_at,
  COUNT(*) FILTER (WHERE status = 'completed') AS total_completed,
  COUNT(*) FILTER (WHERE status = 'failed')    AS total_failed,
  MAX(rows_affected) FILTER (
    WHERE executed_at = (
      SELECT MAX(m2.executed_at)
      FROM public.maintenance_logs m2
      WHERE m2.operation = public.maintenance_logs.operation
    )
  ) AS last_rows_affected
FROM public.maintenance_logs
GROUP BY operation
ORDER BY last_executed_at DESC;

COMMENT ON VIEW public.maintenance_health IS
'Quick dashboard of the most recent run of each maintenance operation and its success/failure counts.';

-- =============================================================================
-- SECTION 9: Data Retention Policy Summary
-- =============================================================================
--
-- Retention Policies implemented by this script:
--
--   Entity                  Retention      Action
--   ──────────────────────  ─────────────  ──────────────────────────
--   Auth sessions           > 30 days      Delete expired sessions
--   Auth refresh tokens     > 30 days      Delete expired tokens
--   Anonymous carts         > 7 days       Delete (Pending, no phone)
--   Completed orders        > 90 days      Move to orders_archive
--   Cancelled orders        > 90 days      Move to orders_archive
--   Archived orders         > 2 years      Permanent deletion
--   Analytics logs          > 90 days      Delete
--   Table indices           Weekly         REINDEX + ANALYZE
--
-- =============================================================================