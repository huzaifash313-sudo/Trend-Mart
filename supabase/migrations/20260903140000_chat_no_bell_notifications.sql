-- Chat alerts stay as `notifications.type = 'message'` for realtime delivery,
-- but the app no longer shows them in the navbar bell (WhatsApp-style chat
-- unread + top banner + web push instead). Mark existing unread chat rows read
-- so old bell badges clear after deploy.

UPDATE public.notifications
SET read = true
WHERE type = 'message' AND read = false;
