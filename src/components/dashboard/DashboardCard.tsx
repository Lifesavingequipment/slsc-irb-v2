import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardCardProps = {
  /** Leading icon, rendered inside a soft orange badge. */
  icon?: ReactNode;
  /** Card title. */
  title?: ReactNode;
  /** Small supporting line under the title. */
  supportingText?: ReactNode;
  /** Optional trailing action (e.g. a button) shown in the header row. */
  action?: ReactNode;
  /** Primary content of the card. */
  children?: ReactNode;
  className?: string;
};

/**
 * Reusable, mobile-first dashboard card.
 *
 * Layout: [icon] + title + supporting text + optional trailing action in the
 * header row, with the primary content below. Generous padding, rounded-2xl,
 * subtle shadow — matching the member dashboard design language.
 */
export function DashboardCard({
  icon,
  title,
  supportingText,
  action,
  children,
  className,
}: DashboardCardProps) {
  const hasHeader = icon || title || supportingText || action;
  return (
    <section
      className={cn(
        "rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-sm transition-colors",
        className,
      )}
    >
      {hasHeader && (
        <div className="flex items-start gap-3">
          {icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FF6600]/10 text-[#FF6600]">
              {icon}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {title && <h2 className="font-semibold leading-tight">{title}</h2>}
            {supportingText && (
              <p className="mt-0.5 text-sm text-muted-foreground">{supportingText}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children && <div className={cn(hasHeader && "mt-3")}>{children}</div>}
    </section>
  );
}
