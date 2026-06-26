-- Backfill: add active members to their club's main chat channel if not already there
INSERT INTO chat_members (channel_id, member_id)
SELECT cc.id AS channel_id, m.id AS member_id
FROM members m
JOIN chat_channels cc ON cc.club_id = m.club_id AND cc.type = 'main'
WHERE m.membership_status IN ('active', 'approved')
  AND NOT EXISTS (
    SELECT 1 FROM chat_members cm
    WHERE cm.channel_id = cc.id AND cm.member_id = m.id
  )
ON CONFLICT (channel_id, member_id) DO NOTHING;

-- Trigger: auto-add member to main chat channel whenever a membership is approved
CREATE OR REPLACE FUNCTION auto_add_member_to_main_chat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_id uuid;
  v_channel_id uuid;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    SELECT id INTO v_member_id
    FROM members
    WHERE club_id = NEW.club_id AND auth_user_id = NEW.user_id
    LIMIT 1;

    IF v_member_id IS NOT NULL THEN
      SELECT id INTO v_channel_id
      FROM chat_channels
      WHERE club_id = NEW.club_id AND type = 'main'
      LIMIT 1;

      IF v_channel_id IS NOT NULL THEN
        INSERT INTO chat_members (channel_id, member_id)
        VALUES (v_channel_id, v_member_id)
        ON CONFLICT (channel_id, member_id) DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_member_to_main_chat
AFTER UPDATE ON club_memberships
FOR EACH ROW EXECUTE FUNCTION auto_add_member_to_main_chat();
