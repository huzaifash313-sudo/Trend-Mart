-- =============================================================================
-- TrendsMart — In-app threaded chat (customer ↔ merchant)
-- =============================================================================
-- Real-time messaging with conversation threads, unread counts, and
-- notifications. Migrates legacy customer_inquiries into conversations.
-- Idempotent — safe to re-run.
-- =============================================================================

BEGIN;

-- ── 1. Conversations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id               uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_name         text NOT NULL DEFAULT '',
  customer_phone        text DEFAULT '',
  order_id              uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  last_message_at       timestamptz NOT NULL DEFAULT now(),
  last_message_preview  text NOT NULL DEFAULT '',
  merchant_unread_count int NOT NULL DEFAULT 0,
  customer_unread_count int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_shop_customer
  ON public.conversations(shop_id, customer_user_id)
  WHERE customer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_shop_last_msg
  ON public.conversations(shop_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_customer_last_msg
  ON public.conversations(customer_user_id, last_message_at DESC)
  WHERE customer_user_id IS NOT NULL;

-- ── 2. Messages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_role      text NOT NULL CHECK (sender_role IN ('customer', 'merchant')),
  sender_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body             text NOT NULL,
  is_deleted       boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  read_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conversation
  ON public.conversation_messages(conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_conv_messages_unread
  ON public.conversation_messages(conversation_id, read_at)
  WHERE read_at IS NULL AND is_deleted = false;

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages ENABLE ROW LEVEL SECURITY;

-- Conversations: shop owner read
DROP POLICY IF EXISTS "conversations_owner_select" ON public.conversations;
CREATE POLICY "conversations_owner_select"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- Conversations: customer read own
DROP POLICY IF EXISTS "conversations_customer_select" ON public.conversations;
CREATE POLICY "conversations_customer_select"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (customer_user_id IS NOT NULL AND customer_user_id = auth.uid());

-- Conversations: customer create
DROP POLICY IF EXISTS "conversations_customer_insert" ON public.conversations;
CREATE POLICY "conversations_customer_insert"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (customer_user_id = auth.uid());

-- Conversations: shop owner create (e.g. from order desk)
DROP POLICY IF EXISTS "conversations_owner_insert" ON public.conversations;
CREATE POLICY "conversations_owner_insert"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- Conversations: participants update (unread counts, preview)
DROP POLICY IF EXISTS "conversations_participant_update" ON public.conversations;
CREATE POLICY "conversations_participant_update"
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    customer_user_id = auth.uid()
    OR auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  )
  WITH CHECK (
    customer_user_id = auth.uid()
    OR auth.uid() = (SELECT owner_id FROM public.shops WHERE id = shop_id)
  );

-- Messages: read if participant
DROP POLICY IF EXISTS "conv_messages_participant_select" ON public.conversation_messages;
CREATE POLICY "conv_messages_participant_select"
  ON public.conversation_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (
          c.customer_user_id = auth.uid()
          OR auth.uid() = (SELECT owner_id FROM public.shops WHERE id = c.shop_id)
        )
    )
  );

-- Messages: customer insert
DROP POLICY IF EXISTS "conv_messages_customer_insert" ON public.conversation_messages;
CREATE POLICY "conv_messages_customer_insert"
  ON public.conversation_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_role = 'customer'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.customer_user_id = auth.uid()
    )
  );

-- Messages: merchant insert
DROP POLICY IF EXISTS "conv_messages_merchant_insert" ON public.conversation_messages;
CREATE POLICY "conv_messages_merchant_insert"
  ON public.conversation_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_role = 'merchant'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND auth.uid() = (SELECT owner_id FROM public.shops WHERE id = c.shop_id)
    )
  );

-- Messages: update (mark read, soft delete)
DROP POLICY IF EXISTS "conv_messages_participant_update" ON public.conversation_messages;
CREATE POLICY "conv_messages_participant_update"
  ON public.conversation_messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (
          c.customer_user_id = auth.uid()
          OR auth.uid() = (SELECT owner_id FROM public.shops WHERE id = c.shop_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (
          c.customer_user_id = auth.uid()
          OR auth.uid() = (SELECT owner_id FROM public.shops WHERE id = c.shop_id)
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.conversation_messages TO authenticated;
GRANT ALL ON public.conversations TO service_role;
GRANT ALL ON public.conversation_messages TO service_role;

ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_messages REPLICA IDENTITY FULL;

-- ── 4. Extend notification types ─────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('support', 'order', 'sale', 'inquiry', 'message', 'system'));

-- ── 5. Triggers: message → conversation metadata + notify ────────────────────
CREATE OR REPLACE FUNCTION public.on_conversation_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.conversations%ROWTYPE;
  shop_owner uuid;
  preview text;
BEGIN
  SELECT * INTO conv FROM public.conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  preview := left(regexp_replace(NEW.body, E'[\\n\\r]+', ' ', 'g'), 120);

  UPDATE public.conversations
  SET
    last_message_at = NEW.created_at,
    last_message_preview = preview,
    updated_at = now(),
    merchant_unread_count = CASE
      WHEN NEW.sender_role = 'customer' THEN merchant_unread_count + 1
      ELSE merchant_unread_count
    END,
    customer_unread_count = CASE
      WHEN NEW.sender_role = 'merchant' THEN customer_unread_count + 1
      ELSE customer_unread_count
    END
  WHERE id = NEW.conversation_id;

  SELECT owner_id INTO shop_owner FROM public.shops WHERE id = conv.shop_id;

  IF NEW.sender_role = 'customer' AND shop_owner IS NOT NULL THEN
    PERFORM public.create_notification(
      shop_owner,
      'message',
      'New message from ' || COALESCE(NULLIF(conv.customer_name, ''), 'a customer'),
      preview,
      '/dashboard/inquiries?c=' || conv.id::text,
      conv.id::text
    );
  ELSIF NEW.sender_role = 'merchant' AND conv.customer_user_id IS NOT NULL THEN
    PERFORM public.create_notification(
      conv.customer_user_id,
      'message',
      'Reply from shop',
      preview,
      '/account/inquiries?c=' || conv.id::text,
      conv.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_message_insert ON public.conversation_messages;
CREATE TRIGGER trg_conversation_message_insert
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_conversation_message_insert();

-- ── 6. Migrate legacy inquiries → conversations ─────────────────────────────
DO $$
DECLARE
  inq record;
  conv_id uuid;
BEGIN
  FOR inq IN
    SELECT *
    FROM public.customer_inquiries
    WHERE customer_user_id IS NOT NULL
    ORDER BY created_at ASC
  LOOP
    SELECT id INTO conv_id
    FROM public.conversations
    WHERE shop_id = inq.shop_id AND customer_user_id = inq.customer_user_id
    LIMIT 1;

    IF conv_id IS NULL THEN
      INSERT INTO public.conversations (
        shop_id, customer_user_id, customer_name, customer_phone,
        last_message_at, last_message_preview, merchant_unread_count, customer_unread_count,
        created_at, updated_at
      ) VALUES (
        inq.shop_id,
        inq.customer_user_id,
        COALESCE(inq.customer_name, ''),
        COALESCE(inq.customer_phone, ''),
        COALESCE(inq.replied_at, inq.created_at),
        left(COALESCE(inq.merchant_reply, inq.message, ''), 120),
        CASE WHEN inq.is_read THEN 0 ELSE 1 END,
        CASE WHEN inq.merchant_reply IS NOT NULL THEN 1 ELSE 0 END,
        inq.created_at,
        COALESCE(inq.updated_at, inq.created_at)
      )
      RETURNING id INTO conv_id;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.conversation_messages
      WHERE conversation_id = conv_id
        AND sender_role = 'customer'
        AND body = inq.message
        AND created_at = inq.created_at
    ) THEN
      INSERT INTO public.conversation_messages (
        conversation_id, sender_role, sender_user_id, body, created_at, read_at
      ) VALUES (
        conv_id, 'customer', inq.customer_user_id, inq.message, inq.created_at,
        CASE WHEN inq.is_read THEN inq.created_at ELSE NULL END
      );
    END IF;

    IF inq.merchant_reply IS NOT NULL AND inq.merchant_reply <> '' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.conversation_messages
        WHERE conversation_id = conv_id
          AND sender_role = 'merchant'
          AND body = inq.merchant_reply
      ) THEN
        INSERT INTO public.conversation_messages (
          conversation_id, sender_role, body, created_at, read_at
        ) VALUES (
          conv_id, 'merchant', inq.merchant_reply,
          COALESCE(inq.replied_at, inq.created_at),
          NULL
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── 7. Realtime publication ────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

COMMIT;
