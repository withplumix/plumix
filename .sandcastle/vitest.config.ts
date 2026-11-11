import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // GitHub adapter tests change PATH; keep each file's process globals isolated.
    isolate: true,
    include: ["lib/*.test.ts"],
    exclude: ["worktrees/**", "runs/**", "node_modules/**"],
  },
});
