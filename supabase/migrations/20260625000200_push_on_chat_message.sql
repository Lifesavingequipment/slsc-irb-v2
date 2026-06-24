-- Trigger: fires send-push for all channel members (except sender) on every chat_messages INSERT.
-- sender_id references members.id (not auth.users).
-- Batch guard: if the same sender already triggered a push in this channel within 2 min, skip.
-- chat_message type is skipped by trg_push_on_notification to avoid double-firing.

CREATE OR REPLACE FUNCTION notify_push_on_chat_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sender_name text;
  v_channel_name text;
  v_club_id uuid;
  v_recipient RECORD;
  v_body text;
  v_last_notified timestamptz;
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

  SELECT MAX(n.created_at) INTO v_last_notified
  FROM public.notifications n
  WHERE n.notification_type = 'chat_message'
    AND n.related_id = NEW.channel_id
    AND n.club_id = v_club_id
    AND n.created_at > now() - interval '2 minutes'
    AND n.message LIKE v_sender_name || ':%';

  IF v_last_notified IS NOT NULL THEN RETURN NEW; END IF;

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
    INSERT INTO public.notifications (club_id, member_id, notification_type, message, related_id)
    VALUES (v_club_id, v_recipient.member_id, 'chat_message',
            v_sender_name || ': ' || v_body, NEW.channel_id);

    IF v_recipient.wants_push THEN
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
          'url',        '/chat/' || NEW.channel_id::text
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_push_on_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_push_on_chat_message();
