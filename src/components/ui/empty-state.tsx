import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Friendly empty-state card with an icon, short explanation, and a primary
 * next-best action. Use instead of bare "No X yet" strings on list pages.
 */
export function EmptyState({ icon, title, description, action, className }: Props) {
  return (
    <Card className={`p-6 text-center space-y-3 ${className ?? ""}`}>
      {icon && (
        <div className="mx-auto h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground max-w-xs mx-auto">{description}</p>
        )}
      </div>
      {action && <div className="pt-1 flex justify-center">{action}</div>}
    </Card>
  );
}
