import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "tooling/typescript": {
      entry: ["*.json"],
    },
    // shadcn-generated UI primitives are a vendored component library:
    // we ship the full set, only some are used today, the rest become API
    // as features land. Skip analysis so unused primitives stay quiet.
    "packages/admin": {
      ignore: ["src/components/ui/**"],
    },
    // @plumix/core is a dependency but has no real imports yet (empty skeleton).
    // Remove these once packages have actual code importing from core.
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
