import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useClub } from "@/lib/club-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { memberships, loading: clubLoading } = useClub();
  const navigate = useNavigate();
  const location = useLocation();
  const [ecChecked, setEcChecked] = useState(false);
  const [needsEc, setNeedsEc] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate({ to: "/login", replace: true }); return; }
    if (clubLoading) return;
    const approved = memberships.some((m) => m.status === "approved");
    const onOnboarding = location.pathname.startsWith("/onboarding");
    if (!approved && !onOnboarding) {
      navigate({ to: "/onboarding", replace: true });
    }
  }, [authLoading, clubLoading, user, memberships, location.pathname, navigate]);

  // Check whether the user has at least one emergency contact across their approved clubs.
  useEffect(() => {
    if (!user || clubLoading) return;
    const approvedIds = memberships.filter((m) => m.status === "approved").map((m) => m.club_id);
    if (approvedIds.length === 0) { setEcChecked(true); setNeedsEc(false); return; }
    supabase
      .from("member_emergency_contacts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("club_id", approvedIds)
      .then(({ count }) => {
        setNeedsEc((count ?? 0) === 0);
        setEcChecked(true);
      });
  }, [user, clubLoading, memberships]);

  useEffect(() => {
    if (!ecChecked) return;
    if (needsEc && location.pathname !== "/onboarding/complete") {
      navigate({ to: "/onboarding/complete", replace: true });
    }
  }, [ecChecked, needsEc, location.pathname, navigate]);

  if (authLoading || (user && clubLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return null;

  return <Outlet />;
}
