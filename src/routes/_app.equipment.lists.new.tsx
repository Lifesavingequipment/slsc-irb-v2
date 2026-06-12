import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { EquipmentTabs } from "@/components/equipment/EquipmentTabs";
import { ListEditor } from "@/components/equipment/ListEditor";
import { useClub, useCanManage } from "@/lib/club-context";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/equipment/lists/new")({
  head: () => ({ meta: [{ title: "New List — IRB Coaching" }] }),
  component: NewListPage,
});

function NewListPage() {
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const { user } = useAuth();
  if (!activeClub || !user) {
    return <AppShell><div className="py-12 text-center text-sm text-muted-foreground">Loading…</div></AppShell>;
  }
  if (!canManage) return <Navigate to="/equipment/lists" replace />;
  return (
    <AppShell title="New list">
      <EquipmentTabs />
      <ListEditor clubId={activeClub.club_id} userId={user.id} />
    </AppShell>
  );
}
