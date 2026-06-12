import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CoachPermKey =
  | "manage_equipment"
  | "view_medical"
  | "view_emergency"
  | "manage_attendance"
  | "manage_waves"
  | "manage_documents"
  | "manage_member_rsvps"
  | "manage_templates"
  | "manage_training_plans"
  | "view_survey_results";

export interface CoachPermissions {
  manage_equipment: boolean;
  view_medical: boolean;
  view_emergency: boolean;
  manage_attendance: boolean;
  manage_waves: boolean;
  manage_documents: boolean;
  manage_member_rsvps: boolean;
  manage_templates: boolean;
  manage_training_plans: boolean;
  view_survey_results: boolean;
}

export const COACH_PERM_LABELS: Record<CoachPermKey, { label: string; description: string }> = {
  manage_equipment:      { label: "Manage equipment",         description: "Add, edit and remove gear, lists and faults." },
  view_medical:          { label: "View medical info",        description: "See members' allergies, medications and conditions." },
  view_emergency:        { label: "View emergency contacts",  description: "See members' next-of-kin contact details." },
  manage_attendance:     { label: "Manage attendance",        description: "Mark members present, absent or excused on sessions." },
  manage_waves:          { label: "Manage waves & teams",     description: "Build session waves and assign crews." },
  manage_documents:      { label: "Manage documents",         description: "Upload and edit club documents." },
  manage_member_rsvps:   { label: "Manage member RSVPs",      description: "Add, change or remove RSVPs on behalf of other members. Off by default." },
  manage_training_plans: { label: "Manage training plans",    description: "Create and edit the training plan for sessions." },
  view_survey_results:   { label: "View survey results",      description: "See members' answers to pre-training survey questions." },
  manage_templates:      { label: "Manage templates",         description: "Create and edit saved templates for carpool, surveys, training plans and drills. Off by default." },
};

export const DEFAULT_COACH_PERMISSIONS: CoachPermissions = {
  manage_equipment: true,
  view_medical: true,
  view_emergency: true,
  manage_attendance: true,
  manage_waves: true,
  manage_documents: true,
  manage_member_rsvps: false,
  manage_templates: false,
  manage_training_plans: true,
  view_survey_results: true,
};

export function useCoachPermissions(clubId: string | null | undefined) {
  const [perms, setPerms] = useState<CoachPermissions>(DEFAULT_COACH_PERMISSIONS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!clubId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("coach_permissions")
      .select("manage_equipment, view_medical, view_emergency, manage_attendance, manage_waves, manage_documents, manage_member_rsvps, manage_templates, manage_training_plans, view_survey_results")
      .eq("club_id", clubId)
      .maybeSingle();
    if (data) setPerms({ ...DEFAULT_COACH_PERMISSIONS, ...(data as Partial<CoachPermissions>) });
    else setPerms(DEFAULT_COACH_PERMISSIONS);
    setLoading(false);
  }, [clubId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { perms, loading, refresh };
}
