import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, Settings, Building2, PlusCircle, LogOut, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { useCanManage } from "@/lib/club-context";
import { signOutAndRedirect } from "@/lib/sign-out";

export const Route = createFileRoute("/_app/more")({
  head: () => ({ meta: [{ title: "More — IRB Coaching" }] }),
  component: MorePage,
});

function MoreRow({ icon: Icon, label, onClick, to, search }: {
  icon: typeof Users;
  label: string;
  onClick?: () => void;
  to?: string;
  search?: Record<string, unknown>;
}) {
  const content = (
    <>
      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
      <span className="flex-1 font-medium">{label}</span>
      <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
    </>
  );
  const className = "flex items-center gap-3 h-14 w-full px-4 active:bg-primary/10 transition-colors";
  if (to) {
    return (
      <Link to={to} search={search} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function MorePage() {
  const canManage = useCanManage();

  return (
    <AppShell title="More">
      <Card className="rounded-xl border bg-white divide-y overflow-hidden">
        {canManage && <MoreRow icon={Users} label="Members" to="/members" />}
        <MoreRow icon={Settings} label="Settings" to="/settings" />
        <MoreRow icon={Building2} label="Club options" to="/settings" search={{ section: "clubs" }} />
        <MoreRow icon={PlusCircle} label="Join or create another club" to="/onboarding" search={{ add: 1 }} />
        <MoreRow icon={LogOut} label="Logout" onClick={() => void signOutAndRedirect()} />
      </Card>
    </AppShell>
  );
}
