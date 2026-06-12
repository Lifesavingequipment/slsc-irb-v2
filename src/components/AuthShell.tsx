import { Waves } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surf-gradient text-primary-foreground flex flex-col">
      <div className="safe-top px-6 pt-10 pb-8 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
          <Waves className="h-5 w-5" />
        </div>
        <div className="font-semibold tracking-tight">IRB Coaching</div>
      </div>
      <div className="flex-1 bg-background text-foreground rounded-t-3xl px-6 pt-8 pb-10 shadow-2xl">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
      </div>
    </div>
  );
}
