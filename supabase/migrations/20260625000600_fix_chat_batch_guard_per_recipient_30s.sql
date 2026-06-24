-- Per-recipient batch guard: 30-second window, resets when recipient has replied
-- since the sender's last message. In-app notification always inserted; push suppressed only.

CREATE OR REPLACE FUNCTION notify_push_on_chat_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sender_name text;
  v_channel_name text;
  v_club_id uuid;
  v_recipient RECORD;
  v_body text;
  v_last_sender_msg timestamptz;
  v_recipient_replied boolean;
  v_service_role_key text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT m.first_name || ' ' || m.last_name, ch.name, ch.club_id
  INTO v_sender_name, v_channel_name, v_club_id
  FROM public.members m
  JOIN public.chat_channels ch ON ch.id = NEW.channel_id
  WHERE m.id = NEW.sender_id
  LIMIT 1;

  IF v_sender_name IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key'
  LIMIT 1;

  IF v_service_role_key IS NULL THEN RETURN NEW; END IF;

  v_body := left(NEW.body, 80) || CASE WHEN length(NEW.body) > 80 THEN '…' ELSE '' END;

  FOR v_recipient IN
    SELECT
      cm.member_id,
      m.auth_user_id,
      COALESCE(mp.notify_chat_messages, true) AS wants_push
    FROM public.chat_members cm
    JOIN public.members m ON m.id = cm.member_id
    LEFT JOIN public.member_preferences mp ON mp.user_id = m.auth_user_id
    WHERE cm.channel_id = NEW.channel_id
      AND cm.member_id <> NEW.sender_id
  LOOP
    -- Find sender's most recent prior message in last 30 seconds
    SELECT MAX(cm2.created_at) INTO v_last_sender_msg
    FROM public.chat_messages cm2
    WHERE cm2.channel_id = NEW.channel_id
      AND cm2.sender_id = NEW.sender_id
      AND cm2.id <> NEW.id
      AND cm2.created_at > now() - interval '30 seconds'
      AND cm2.deleted_at IS NULL;

    -- Check if recipient replied after that message (resets the guard)
    IF v_last_sender_msg IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.chat_messages cm3
        WHERE cm3.channel_id = NEW.channel_id
          AND cm3.sender_id = v_recipient.member_id
          AND cm3.created_at > v_last_sender_msg
          AND cm3.deleted_at IS NULL
      ) INTO v_recipient_replied;
    ELSE
      v_recipient_replied := false;
    END IF;

    -- Always insert in-app notification
    INSERT INTO public.notifications (club_id, member_id, notification_type, message, related_id)
    VALUES (v_club_id, v_recipient.member_id, 'chat_message',
            v_sender_name || ': ' || v_body, NEW.channel_id);

    -- Send push unless suppressed by batch guard
    IF (v_last_sender_msg IS NULL OR v_recipient_replied)
       AND v_recipient.wants_push
       AND v_recipient.auth_user_id IS NOT NULL
    THEN
      PERFORM net.http_post(
        url     := 'https://wrhjentdpnszfugfgrjb.supabase.co/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || v_service_role_key
        ),
        body    := jsonb_build_object(
          'member_ids', jsonb_build_array(v_recipient.member_id),
          'title',      v_sender_name || ' in ' || v_channel_name,
          'body',       v_body,
          'url',        '/chat'
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
