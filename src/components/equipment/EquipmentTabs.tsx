import { Link, useLocation } from "@tanstack/react-router";

const tabs = [
  { to: "/equipment/lists", label: "Lists", match: (p: string) => p === "/equipment/lists" || p.startsWith("/equipment/lists/") },
  { to: "/equipment", label: "Equipment", match: (p: string) => p === "/equipment" || (p.startsWith("/equipment/") && !p.startsWith("/equipment/lists") && !p.startsWith("/equipment/faults")) },
  { to: "/equipment/faults", label: "Faults", match: (p: string) => p.startsWith("/equipment/faults") },
] as const;

export function EquipmentTabs() {
  const location = useLocation();
  return (
    <div className="-mt-1 mb-4 grid grid-cols-3 rounded-xl bg-muted p-1 text-sm font-medium">
      {tabs.map((t) => {
        const active = t.match(location.pathname);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`text-center py-2 rounded-lg transition-colors ${
              active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
