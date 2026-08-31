-- =============================================================================
-- TrendsMart — Story view counts (unique viewers per story)
-- =============================================================================
-- Adds denormalized `view_count` on stories + a `story_views` ledger so each
-- viewer (auth uid or anonymous device key) is counted at most once.
-- Public RPC `record_story_view` is the only write path for anon/auth clients.
-- =============================================================================

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.stories.view_count IS
  'Unique viewers who opened this story. Maintained by record_story_view().';

CREATE TABLE IF NOT EXISTS public.story_views (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id    uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  viewer_key  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_views_viewer_key_len CHECK (
    char_length(viewer_key) >= 8 AND char_length(viewer_key) <= 128
  ),
  CONSTRAINT story_views_unique_viewer UNIQUE (story_id, viewer_key)
);

CREATE INDEX IF NOT EXISTS idx_story_views_story_id
  ON public.story_views(story_id);

CREATE INDEX IF NOT EXISTS idx_story_views_created_at
  ON public.story_views(created_at DESC);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- Shop owners can see who viewed their stories (keys only — no PII beyond uid/anon).
DROP POLICY IF EXISTS "story_views_owner_read" ON public.story_views;
CREATE POLICY "story_views_owner_read"
  ON public.story_views FOR SELECT
  USING (
    auth.uid() = (
      SELECT s.owner_id
      FROM public.shops s
      JOIN public.stories st ON st.shop_id = s.id
      WHERE st.id = story_id
    )
  );

-- No direct INSERT/UPDATE for clients — use the RPC below.
GRANT SELECT ON public.story_views TO authenticated;
GRANT SELECT ON public.story_views TO anon;

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

  -- Only count active (non-expired) stories.
  IF NOT EXISTS (
    SELECT 1
    FROM public.stories s
    WHERE s.id = p_story_id
      AND s.expires_at > now()
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.story_views (story_id, viewer_key)
  VALUES (p_story_id, v_key)
  ON CONFLICT (story_id, viewer_key) DO NOTHING;

  IF FOUND THEN
    UPDATE public.stories
    SET view_count = view_count + 1
    WHERE id = p_story_id
    RETURNING view_count INTO v_count;
    RETURN v_count;
  END IF;

  SELECT s.view_count INTO v_count
  FROM public.stories s
  WHERE s.id = p_story_id;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_story_view(uuid, text) TO anon, authenticated;

COMMENT ON FUNCTION public.record_story_view(uuid, text) IS
  'Records a unique story view and returns the updated view_count. Idempotent per (story, viewer_key).';
