import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/locations")({
  head: () => ({ meta: [{ title: "Saved locations — IRB Coaching" }] }),
  component: () => <Navigate to="/settings" />,
});
