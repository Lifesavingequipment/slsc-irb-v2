import { useEffect } from "react";
import { useBlocker } from "@tanstack/react-router";

/**
 * Warn the user about unsaved changes when:
 *  - they try to close/refresh the tab (beforeunload)
 *  - they navigate within the SPA (router blocker + confirm dialog)
 */
export function useUnsavedChanges(dirty: boolean, message = "You have unsaved changes. Leave this page?") {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, message]);

  useBlocker({
    shouldBlockFn: () => {
      if (!dirty) return false;
      return !window.confirm(message);
    },
    enableBeforeUnload: false,
  });
}
