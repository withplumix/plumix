import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { ADMIN_BASE_PATH } from "./src/constants.js";

export default defineConfig({
  base: `${ADMIN_BASE_PATH}/`,
  // tanstackRouter must come before @vitejs/plugin-react — the router plugin
  // rewrites route files and its transform needs to run first.
  // quoteStyle + semicolons match prettier so routeTree.gen.ts survives a
  // build → format round-trip without churn.
  plugins: [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      quoteStyle: "double",
      semicolons: true,
    }),
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
