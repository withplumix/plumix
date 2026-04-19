import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Admin runs under /_plumix/admin/* in production (mounted by the plumix
// runtime dispatcher). Using the same base in dev keeps routing identical
// across environments — no conditional basepath gymnastics.
const ADMIN_BASE = "/_plumix/admin/" as const;

export default defineConfig({
  base: ADMIN_BASE,
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
