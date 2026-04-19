import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "tooling/typescript": {
      entry: ["*.json"],
    },
    // @plumix/core is a dependency but has no real imports yet (empty skeleton).
    // Remove these once packages have actual code importing from core.
    "packages/admin": {
      ignoreDependencies: ["@plumix/core"],
    },
    "packages/blocks": {
      ignoreDependencies: ["@plumix/core"],
    },
    "packages/plugins/blog": {
      ignoreDependencies: ["@plumix/core"],
    },
    "packages/plugins/pages": {
      ignoreDependencies: ["@plumix/core"],
    },
    // drizzle-kit is invoked by consumers as a CLI hint, not imported.
    "packages/plumix": {
      entry: [
        "src/index.ts",
        "src/plugin.ts",
        "src/admin/index.ts",
        "src/blocks/index.ts",
        "src/cli/index.ts",
        "src/i18n/index.ts",
        "src/schema/index.ts",
        "src/test/index.ts",
        "src/theme/index.ts",
        "src/vite/index.ts",
      ],
      ignoreDependencies: ["drizzle-kit"],
    },
  },
};

export default config;
