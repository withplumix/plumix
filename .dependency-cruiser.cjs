// Plumix package boundary enforcement.
//
// Consumer packages (plugins, runtimes, examples, playgrounds, the
// scaffolder) must import from the public 'plumix' umbrella — never
// reach into the internal @plumix/{core,admin,blocks} packages. This
// file is the single source of truth.

const INTERNAL_PACKAGES = "(core|admin|blocks)";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-internal-from-consumer",
      severity: "error",
      comment:
        "Use 'plumix' (or one of its subpaths) instead of reaching into internal @plumix/{core,admin,blocks} packages.",
      from: {
        path: "^(packages/(plugins|runtimes|create-plumix-app)|examples)/",
        // Skip emitted .d.ts/.js — TypeScript's declaration emit may
        // still reference @plumix/core (a publish-readiness concern
        // tracked outside this PR).
        pathNot: "/dist/",
      },
      to: {
        path: `^(packages/${INTERNAL_PACKAGES}/|@plumix/${INTERNAL_PACKAGES}(/|$))`,
      },
    },
  ],
  options: {
    doNotFollow: { path: "(node_modules|/dist/|/\\.cache/|/\\.turbo/)" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["module", "main", "types"],
    },
  },
};
