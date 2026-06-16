import type { ReactNode } from "react";

export function AuthShell({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <img src="/irb-logo.png" alt="Logo" className="h-12 w-12 rounded-full object-contain bg-[#FF6600]" />
          <div className="font-semibold tracking-tight text-foreground">IRB Training</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl px-6 py-8 shadow-sm">
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
