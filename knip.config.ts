import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "tooling/typescript": {
      entry: ["*.json"],
    },
    // @plumix/core is a dependency but has no real imports yet (empty skeleton).
    // Remove these once packages have actual code importing from core.
    "packages/plumix": {
      ignoreDependencies: ["@plumix/core"],
    },
    "packages/admin": {
      ignoreDependencies: ["@plumix/core"],
    },
    "packages/blocks": {
      ignoreDependencies: ["@plumix/core"],
    },
    "packages/runtimes/cloudflare": {
      ignoreDependencies: ["@plumix/core"],
    },
    "packages/plugins/blog": {
      ignoreDependencies: ["@plumix/core"],
    },
    "packages/plugins/pages": {
      ignoreDependencies: ["@plumix/core"],
    },
  },
};

export default config;
