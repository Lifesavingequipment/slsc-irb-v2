import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { AlertTriangle, Trash2 } from "lucide-react";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Style the confirm button as destructive (default: true) */
  destructive?: boolean;
  /** Show a spinner on confirm while awaiting (default: false) */
  loading?: boolean;
};

type Ctx = (opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ctx | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const [confirming, setConfirming] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Ctx>((options) => {
    setOpts(options ?? {});
    setConfirming(false);
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const finish = (value: boolean) => {
    setOpen(false);
    setConfirming(false);
    resolver.current?.(value);
    resolver.current = null;
  };

  const handleConfirm = () => {
    setConfirming(true);
    // Give a brief moment for the spinner to show, then resolve
    setTimeout(() => finish(true), 120);
  };

  const isDestructive = opts.destructive !== false;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o && !confirming) finish(false); }}>
        <AlertDialogContent className="!rounded-2xl !max-w-sm mx-auto">
          <AlertDialogHeader className="!text-left">
            <div className="flex items-start gap-3 mb-1">
              {isDestructive ? (
                <div className="mt-0.5 shrink-0 h-9 w-9 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </div>
              ) : (
                <div className="mt-0.5 shrink-0 h-9 w-9 rounded-full bg-warning/15 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                </div>
              )}
              <div className="pt-1">
                <AlertDialogTitle className="text-base">{opts.title ?? "Are you sure?"}</AlertDialogTitle>
                {opts.description && (
                  <AlertDialogDescription className="mt-1 text-sm leading-relaxed">
                    {opts.description}
                  </AlertDialogDescription>
                )}
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="!flex-row gap-2 mt-1">
            <AlertDialogCancel
              onClick={() => finish(false)}
              className="flex-1 rounded-xl h-10"
              disabled={confirming}
            >
              {opts.cancelText ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={confirming}
              className={[
                "flex-1 rounded-xl h-10 gap-2",
                isDestructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "",
              ].join(" ")}
            >
              {confirming && <Spinner size="xs" className="opacity-80" />}
              {opts.confirmText ?? "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Ctx {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
