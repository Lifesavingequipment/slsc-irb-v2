// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    optimizeDeps: {
      include: [
        "@radix-ui/react-avatar",
        "@radix-ui/react-dialog",
        "@radix-ui/react-dropdown-menu",
        "@radix-ui/react-label",
        "@radix-ui/react-select",
        "@radix-ui/react-slot",
        "@radix-ui/react-tabs",
        "@supabase/supabase-js",
        "class-variance-authority",
        "clsx",
        "date-fns",
        "lucide-react",
        "sonner",
        "tailwind-merge",
        "zod",
      ],
    },
  },
  // Force nitro to run with the Vercel preset so the build produces
  // .vercel/output/ (functions + static) rather than a plain SPA bundle.
  nitro: { preset: "vercel" },
  tanstackStart: {
    server: { entry: "server" },
  },
});
