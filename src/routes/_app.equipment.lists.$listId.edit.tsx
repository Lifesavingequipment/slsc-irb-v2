import { FormSkeleton } from "@/components/ui/page-skeleton";
import { showToast } from "@/lib/toast";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { EquipmentTabs } from "@/components/equipment/EquipmentTabs";
import { ListEditor } from "@/components/equipment/ListEditor";
import { useClub, useCanManage } from "@/lib/club-context";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/equipment/lists/$listId/edit")({
  head: () => ({ meta: [{ title: "Edit List — IRB Coaching" }] }),
  component: EditListPage,
});

function EditListPage() {
  const { listId } = Route.useParams();
  const { activeClub } = useClub();
  const canManage = useCanManage();
  const { user } = useAuth();
  if (!activeClub || !user) {
    return <AppShell><div className="p-4"><FormSkeleton fields={4} /></div></AppShell>;
  }
  if (!canManage) return <Navigate to="/equipment/lists" replace />;
  return (
    <AppShell title="Edit list">
      <EquipmentTabs />
      <ListEditor clubId={activeClub.club_id} userId={user.id} listId={listId} />
    </AppShell>
  );
}
