
-- Helper: write a row, no-op if club_id resolves to NULL.
CREATE OR REPLACE FUNCTION public.log_audit(
  _action text, _club_id uuid, _target_user_id uuid, _details jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _club_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.audit_log (actor_user_id, action, club_id, target_user_id, details)
  VALUES (COALESCE(auth.uid(), _target_user_id), _action, _club_id, _target_user_id, _details);
END $$;

-- Sessions: create / edit / delete
CREATE OR REPLACE FUNCTION public.audit_sessions_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE changed jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('session_create', NEW.club_id, NULL,
      jsonb_build_object('session_id', NEW.id, 'title', NEW.title, 'starts_at', NEW.starts_at));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    changed := jsonb_strip_nulls(jsonb_build_object(
      'title',         CASE WHEN NEW.title         IS DISTINCT FROM OLD.title         THEN NEW.title         END,
      'starts_at',     CASE WHEN NEW.starts_at     IS DISTINCT FROM OLD.starts_at     THEN NEW.starts_at     END,
      'ends_at',       CASE WHEN NEW.ends_at       IS DISTINCT FROM OLD.ends_at       THEN NEW.ends_at       END,
      'location',      CASE WHEN NEW.location      IS DISTINCT FROM OLD.location      THEN NEW.location      END,
      'notes',         CASE WHEN NEW.notes         IS DISTINCT FROM OLD.notes         THEN NEW.notes         END,
      'capacity',      CASE WHEN NEW.capacity      IS DISTINCT FROM OLD.capacity      THEN NEW.capacity      END,
      'rsvp_deadline', CASE WHEN NEW.rsvp_deadline IS DISTINCT FROM OLD.rsvp_deadline THEN NEW.rsvp_deadline END
    ));
    IF changed <> '{}'::jsonb THEN
      PERFORM public.log_audit('session_update', NEW.club_id, NULL,
        jsonb_build_object('session_id', NEW.id, 'changes', changed));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit('session_delete', OLD.club_id, NULL,
      jsonb_build_object('session_id', OLD.id, 'title', OLD.title));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS audit_sessions ON public.sessions;
CREATE TRIGGER audit_sessions
  AFTER INSERT OR UPDATE OR DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_sessions_trg();

-- Session RSVPs: log only when an admin/coach acts on someone else.
CREATE OR REPLACE FUNCTION public.audit_session_rsvps_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_club uuid;
  v_actor uuid := auth.uid();
  v_target uuid;
  v_action text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target := OLD.user_id;
    SELECT club_id INTO v_club FROM public.sessions WHERE id = OLD.session_id;
    v_action := 'rsvp_delete';
  ELSE
    v_target := NEW.user_id;
    SELECT club_id INTO v_club FROM public.sessions WHERE id = NEW.session_id;
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'rsvp_create' ELSE 'rsvp_update' END;
  END IF;

  -- Self-actions aren't an admin event — skip.
  IF v_actor IS NULL OR v_actor = v_target THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM public.log_audit(v_action, v_club, v_target,
    jsonb_build_object(
      'session_id', COALESCE(NEW.session_id, OLD.session_id),
      'status', COALESCE(NEW.status::text, OLD.status::text)
    ));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS audit_session_rsvps ON public.session_rsvps;
CREATE TRIGGER audit_session_rsvps
  AFTER INSERT OR UPDATE OR DELETE ON public.session_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.audit_session_rsvps_trg();

-- Generic equipment-table logger (works for any table with a club_id column).
CREATE OR REPLACE FUNCTION public.audit_club_scoped_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_club uuid;
  v_id uuid;
  v_name text;
  v_op text;
  rec record;
BEGIN
  rec := COALESCE(NEW, OLD);
  EXECUTE format('SELECT ($1).club_id, ($1).id, COALESCE(($1).name::text, NULL)')
    INTO v_club, v_id, v_name USING rec;
  v_op := lower(TG_OP);
  PERFORM public.log_audit(TG_ARGV[0] || '_' || v_op, v_club, NULL,
    jsonb_build_object('id', v_id, 'name', v_name));
  RETURN rec;
END $$;

DROP TRIGGER IF EXISTS audit_equipment ON public.equipment;
CREATE TRIGGER audit_equipment AFTER INSERT OR UPDATE OR DELETE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.audit_club_scoped_trg('equipment');

DROP TRIGGER IF EXISTS audit_equipment_categories ON public.equipment_categories;
CREATE TRIGGER audit_equipment_categories AFTER INSERT OR UPDATE OR DELETE ON public.equipment_categories
  FOR EACH ROW EXECUTE FUNCTION public.audit_club_scoped_trg('equipment_category');

DROP TRIGGER IF EXISTS audit_equipment_lists ON public.equipment_lists;
CREATE TRIGGER audit_equipment_lists AFTER INSERT OR UPDATE OR DELETE ON public.equipment_lists
  FOR EACH ROW EXECUTE FUNCTION public.audit_club_scoped_trg('equipment_list');

-- equipment_list_items has no club_id directly; resolve via parent list.
CREATE OR REPLACE FUNCTION public.audit_equipment_list_items_trg() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_club uuid;
  v_list uuid;
BEGIN
  v_list := COALESCE(NEW.list_id, OLD.list_id);
  SELECT club_id INTO v_club FROM public.equipment_lists WHERE id = v_list;
  PERFORM public.log_audit('equipment_list_item_' || lower(TG_OP), v_club, NULL,
    jsonb_build_object('list_id', v_list, 'item_id', COALESCE(NEW.id, OLD.id)));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS audit_equipment_list_items ON public.equipment_list_items;
CREATE TRIGGER audit_equipment_list_items
  AFTER INSERT OR UPDATE OR DELETE ON public.equipment_list_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_equipment_list_items_trg();
