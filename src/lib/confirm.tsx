import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** Style the confirm button as destructive (default: true) */
  destructive?: boolean;
};

type Ctx = (opts?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Ctx | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions>({});
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<Ctx>((options) => {
    setOpts(options ?? {});
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const finish = (value: boolean) => {
    setOpen(false);
    resolver.current?.(value);
    resolver.current = null;
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) finish(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts.title ?? "Are you sure?"}</AlertDialogTitle>
            {opts.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>
              {opts.cancelText ?? "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => finish(true)}
              className={
                opts.destructive === false
                  ? undefined
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
            >
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
