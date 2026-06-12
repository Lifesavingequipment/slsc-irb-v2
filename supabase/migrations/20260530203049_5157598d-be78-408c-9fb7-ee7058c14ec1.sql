CREATE POLICY rsvps_insert_coach_admin ON public.session_rsvps
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.sessions s
  WHERE s.id = session_rsvps.session_id
    AND (public.is_club_admin(auth.uid(), s.club_id)
         OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))
));

CREATE POLICY rsvps_update_coach_admin ON public.session_rsvps
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sessions s
  WHERE s.id = session_rsvps.session_id
    AND (public.is_club_admin(auth.uid(), s.club_id)
         OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))
));

CREATE POLICY rsvps_delete_coach_admin ON public.session_rsvps
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sessions s
  WHERE s.id = session_rsvps.session_id
    AND (public.is_club_admin(auth.uid(), s.club_id)
         OR public.has_role(auth.uid(), s.club_id, 'coach'::app_role))
));