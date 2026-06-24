-- Prevent trg_push_on_notification from double-firing for chat_message rows
-- (push is handled directly by trg_push_on_chat_message).

CREATE OR REPLACE FUNCTION notify_push_on_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pref_col text;
  v_pref_ok boolean := true;
  v_service_role_key text;
  v_url text;
BEGIN
  IF NEW.notification_type = 'chat_message' THEN
    RETURN NEW;
  END IF;

  v_pref_col := CASE NEW.notification_type
    WHEN 'new_session'      THEN 'notify_new_sessions'
    WHEN 'session_updated'  THEN 'notify_session_reminders'
    WHEN 'member_approved'  THEN 'notify_join_requests'
    ELSE NULL
  END;

  IF v_pref_col IS NOT NULL THEN
    EXECUTE format(
      'SELECT COALESCE(%I, true) FROM public.member_preferences WHERE user_id = (SELECT auth_user_id FROM public.members WHERE id = $1)',
      v_pref_col
    ) INTO v_pref_ok USING NEW.member_id;
    v_pref_ok := COALESCE(v_pref_ok, true);
  END IF;

  IF NOT v_pref_ok THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_service_role_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_service_role_key IS NULL THEN RETURN NEW; END IF;

  v_url := CASE NEW.notification_type
    WHEN 'new_session'     THEN '/sessions/' || NEW.related_id::text
    WHEN 'session_updated' THEN '/sessions/' || NEW.related_id::text
    ELSE '/'
  END;

  PERFORM net.http_post(
    url     := 'https://wrhjentdpnszfugfgrjb.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    ),
    body    := jsonb_build_object(
      'member_ids', jsonb_build_array(NEW.member_id),
      'title',      split_part(NEW.message, ': ', 1),
      'body',       CASE WHEN strpos(NEW.message, ': ') > 0
                         THEN trim(substring(NEW.message FROM strpos(NEW.message, ': ') + 2))
                         ELSE NEW.message
                    END,
      'url',        v_url
    )
  );

  RETURN NEW;
END;
$$;
