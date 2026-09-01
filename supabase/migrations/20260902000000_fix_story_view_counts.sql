-- =============================================================================
-- TrendsMart — Fix record_story_view() insert detection (reliable unique counts)
-- =============================================================================
-- Replaces FOUND-based logic with a CTE so each (story, viewer_key) increments
-- view_count exactly once — same viewer re-opening a story does not add again.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_story_view(
  p_story_id uuid,
  p_viewer_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
  v_key   text;
BEGIN
  v_key := trim(COALESCE(p_viewer_key, ''));
  IF p_story_id IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 128 THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.id = p_story_id
      AND s.expires_at > now()
  ) THEN
    RETURN NULL;
  END IF;

  WITH ins AS (
    INSERT INTO public.story_views (story_id, viewer_key)
    VALUES (p_story_id, v_key)
    ON CONFLICT (story_id, viewer_key) DO NOTHING
    RETURNING story_id
  ),
  bumped AS (
    UPDATE public.stories s
    SET view_count = s.view_count + 1
    WHERE s.id = p_story_id
      AND EXISTS (SELECT 1 FROM ins)
    RETURNING s.view_count
  )
  SELECT b.view_count INTO v_count FROM bumped b;

  IF v_count IS NOT NULL THEN
    RETURN v_count;
  END IF;

  SELECT s.view_count INTO v_count
  FROM public.stories s
  WHERE s.id = p_story_id;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_story_view(uuid, text) TO anon, authenticated;
