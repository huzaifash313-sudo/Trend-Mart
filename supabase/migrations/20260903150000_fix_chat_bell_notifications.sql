-- Fix chat notifications landing in the navbar bell.
-- Bug: create_notification() coerced type 'message' → 'system' (only
-- support|order|sale|inquiry|system were allowed), so client filters that
-- exclude type='message' never matched "Reply from shop" rows.
--
-- 1) Allow 'message' in create_notification (keep trigger creating message rows
--    for in-app banner / realtime — bell UI still filters them out)
-- 2) Purge legacy chat rows stored as type=system (and any type=message leftovers)

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT '',
  p_link_url text DEFAULT '',
  p_entity_id text DEFAULT ''
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL OR p_title IS NULL OR p_title = '' THEN
    RETURN;
  END IF;
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, link_url, entity_id)
    VALUES (
      p_user_id,
      CASE WHEN p_type IN ('support', 'order', 'sale', 'inquiry', 'message', 'system')
           THEN p_type ELSE 'system' END,
      left(p_title, 160),
      left(COALESCE(p_body, ''), 500),
      left(COALESCE(p_link_url, ''), 300),
      left(COALESCE(p_entity_id, ''), 64)
    );
  EXCEPTION
    WHEN OTHERS THEN NULL;
  END;
END;
$$;

-- Ensure check constraint allows message (idempotent).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('support', 'order', 'sale', 'inquiry', 'message', 'system'));

-- Purge chat rows that polluted the bell (mis-typed system + leftover message).
DELETE FROM public.notifications
WHERE type = 'message'
   OR (
     type = 'system'
     AND (
       link_url ILIKE '%/inquiries?c=%'
       OR link_url ILIKE '%/account/inquiries%'
       OR link_url ILIKE '%/dashboard/inquiries%'
       OR title ILIKE 'Reply from %'
       OR title ILIKE 'New message from %'
     )
   );
