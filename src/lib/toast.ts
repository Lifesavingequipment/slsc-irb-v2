/**
 * Centralised toast helpers — consistent wording and icons across the app.
 * Import `showToast` instead of using sonner's `toast` directly.
 */
import { toast } from "sonner";

type UndoFn = () => void | Promise<void>;

export const showToast = {
  success(message: string) {
    toast.success(message, { duration: 3000 });
  },

  error(message: string) {
    // Normalise raw Supabase / network errors to something human-readable.
    const readable = normalise(message);
    toast.error(readable, { duration: 6000 });
  },

  info(message: string) {
    toast.info(message, { duration: 4000 });
  },

  warning(message: string) {
    toast.warning(message, { duration: 5000 });
  },

  /** Shows a success toast with an Undo button. Calls `onUndo` if tapped. */
  withUndo(message: string, onUndo: UndoFn, undoLabel = "Undo") {
    toast.success(message, {
      duration: 5000,
      action: {
        label: undoLabel,
        onClick: () => { void onUndo(); },
      },
    });
  },

  /** Dismisses all visible toasts */
  dismiss() {
    toast.dismiss();
  },
};

/** Map raw DB/network errors to user-friendly messages */
function normalise(msg: string): string {
  if (!msg) return "Something went wrong. Please try again.";
  // Supabase RLS
  if (msg.includes("row-level security") || msg.includes("violates row-level")) {
    return "You don't have permission to do that.";
  }
  // Unique violation
  if (msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return "This already exists — check for a duplicate.";
  }
  // FK constraint
  if (msg.includes("foreign key constraint")) {
    return "This item is in use and can't be removed.";
  }
  // Network
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
    return "No connection. Check your internet and try again.";
  }
  return msg;
}
