import { useEffect } from "react";

/**
 * Re-runs the provided callback whenever the window regains focus or the
 * tab becomes visible. Use on list pages so data refreshes after the user
 * navigates back from a detail / create / edit page.
 */
export function useRefetchOnFocus(refetch: () => void) {
  useEffect(() => {
    const onFocus = () => refetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);
}
