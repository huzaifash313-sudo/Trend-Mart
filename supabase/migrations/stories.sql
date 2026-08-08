-- =============================================================================
-- TrendMart — Stories Table Migration
-- Run in Supabase SQL Editor
-- =============================================================================

-- 1. Create stories table -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  image_url   text,
  caption     text DEFAULT '',
  /** Stories are shown for 24 hours, then hidden via the RLS policy below */
  created_at  timestamptz DEFAULT now()
);

-- 2. Index for fast expiry queries --------------------------------------------

CREATE INDEX IF NOT EXISTS idx_stories_shop_id   ON public.stories(shop_id);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON public.stories(created_at DESC);

-- 3. Enable RLS ---------------------------------------------------------------

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- 4. Policies -----------------------------------------------------------------

-- PUBLIC: Anyone can READ stories created within the last 24 hours
CREATE POLICY "stories_public_read_active"
  ON public.stories FOR SELECT
  USING (created_at > (now() - INTERVAL '24 hours'));

-- AUTHENTICATED: Insert a story — must own the linked shop
CREATE POLICY "stories_owner_insert"
  ON public.stories FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- AUTHENTICATED: Delete own story
CREATE POLICY "stories_owner_delete"
  ON public.stories FOR DELETE
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- =============================================================================
-- ✅ Stories auto-expire after 24 hours via the SELECT policy above.
--    You can also optionally run a cron job to clean up old rows:
--
--    DELETE FROM public.stories WHERE created_at < now() - INTERVAL '24 hours';
-- =============================================================================