-- Fix 1: deep link URL was '/chat/<channel_id>' but chat route has no URL param — use '/chat'
-- Fix 2: batch guard was checking notifications table with a LIKE pattern; replaced with a
--        direct chat_messages self-join (same sender, same channel, last 2 min, excluding NEW.id)

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

  -- Batch guard: skip push if same sender posted to same channel in the last 2 minutes
  SELECT MAX(cm2.created_at) INTO v_last_notified
  FROM public.chat_messages cm2
  WHERE cm2.channel_id = NEW.channel_id
    AND cm2.sender_id = NEW.sender_id
    AND cm2.id <> NEW.id
    AND cm2.created_at > now() - interval '2 minutes'
    AND cm2.deleted_at IS NULL;

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
          'url',        '/chat'
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
