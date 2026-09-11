-- Free-tier: keep analytics_logs from filling the 500 MB Free DB.
-- Also stop broadcasting analytics_logs on Realtime (unused on soft-launch;
-- merchant dashboards use count queries + product.click_count instead).

CREATE OR REPLACE FUNCTION public.cleanup_analytics_logs(
  retention_days integer DEFAULT 30
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF retention_days IS NULL OR retention_days < 7 THEN
    retention_days := 7;
  END IF;

  DELETE FROM public.analytics_logs
  WHERE created_at < (now() - make_interval(days => retention_days));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_analytics_logs(integer) IS
  'Deletes analytics_logs older than retention_days (default 30). Soft-launch Free DB guard.';

REVOKE ALL ON FUNCTION public.cleanup_analytics_logs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_analytics_logs(integer) TO service_role;

-- Drop from realtime publication if present (best-effort; ignore if already absent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'analytics_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.analytics_logs';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not drop analytics_logs from realtime: %', SQLERRM;
END;
$$;

-- One-shot prune on migrate so existing soft-launch DBs reclaim space immediately.
SELECT public.cleanup_analytics_logs(30);
