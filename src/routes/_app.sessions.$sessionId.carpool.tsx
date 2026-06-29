import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ChevronLeft } from "lucide-react";
import { CarpoolPanel } from "@/components/session/CarpoolPanel";

export const Route = createFileRoute("/_app/sessions/$sessionId/carpool")({
  head: () => ({ meta: [{ title: "Carpool — IRB Coaching" }] }),
  component: CarpoolPage,
});

function CarpoolPage() {
  const { sessionId } = Route.useParams();
  return (
    <AppShell>
      <Link to="/sessions/$sessionId" params={{ sessionId }}
        className="inline-flex items-center text-sm text-muted-foreground mb-2">
        <ChevronLeft className="h-4 w-4" /> Back to session
      </Link>
      <CarpoolPanel sessionId={sessionId} />
    </AppShell>
  );
}
