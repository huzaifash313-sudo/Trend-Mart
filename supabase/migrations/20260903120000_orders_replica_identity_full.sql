-- Ensure realtime UPDATE payloads include old.status (not PK-only).
-- Without this, order tracking flashes on every non-status update.
ALTER TABLE public.orders REPLICA IDENTITY FULL;
