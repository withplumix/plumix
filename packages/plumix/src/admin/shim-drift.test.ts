import * as ReactNs from "react";
import * as ReactJsxRuntimeNs from "react/jsx-runtime";
import * as LinguiCoreNs from "@lingui/core";
import * as LinguiReactNs from "@lingui/react";
import * as OrpcClientNs from "@orpc/client";
import * as OrpcClientFetchNs from "@orpc/client/fetch";
import * as OrpcTanstackQueryNs from "@orpc/tanstack-query";
import * as ReactQueryNs from "@tanstack/react-query";
import * as ReactRouterNs from "@tanstack/react-router";
import * as RadixNs from "radix-ui";
import * as ReactDomNs from "react-dom";
import * as ReactDomClientNs from "react-dom/client";
import * as SonnerNs from "sonner";
import * as TailwindMergeNs from "tailwind-merge";
import { beforeAll, describe, expect, test } from "vitest";

// Drift detection. Each admin shim hand-re-exports a curated slice of an
// upstream package off `globalThis.plumix.runtime` (admin ships precompiled;
// plugin chunks reach deps via that global). The shims are an *intentional*
// surface, not a mirror — so this guards the failure that actually breaks
// plugins: a binding a shim re-exports having DISAPPEARED upstream (a dangling
// `ns.X` that resolves to `undefined`), e.g. an upstream rename/removal.
//
// It deliberately does NOT fail when upstream *adds* an export the shim hasn't
// adopted. That additive churn forced a manual `KNOWN_GAPS` edit (with a
// written rationale) on every routine dependency bump and didn't scale with
// upstream release cadence (see #1177). New upstream APIs are exposed pull-
// based: add the binding to the shim when a plugin actually needs it.

beforeAll(() => {
  (globalThis as { plumix?: unknown }).plumix = {
    runtime: {
      react: ReactNs,
      reactJsxRuntime: ReactJsxRuntimeNs,
      reactDom: ReactDomNs,
      reactDomClient: ReactDomClientNs,
      reactQuery: ReactQueryNs,
      reactRouter: ReactRouterNs,
      orpcClient: OrpcClientNs,
      orpcClientFetch: OrpcClientFetchNs,
      orpcTanstackQuery: OrpcTanstackQueryNs,
      linguiCore: LinguiCoreNs,
      linguiReact: LinguiReactNs,
      radix: RadixNs,
      sonner: SonnerNs,
      tailwindMerge: TailwindMergeNs,
    },
  };
});

interface ShimSpec {
  readonly name: string;
  readonly load: () => Promise<Readonly<Record<string, unknown>>>;
}

const SHIMS: readonly ShimSpec[] = [
  { name: "react", load: () => import("./react.js") },
  { name: "react/jsx-runtime", load: () => import("./react-jsx-runtime.js") },
  { name: "react-dom", load: () => import("./react-dom.js") },
  { name: "react-dom/client", load: () => import("./react-dom-client.js") },
  { name: "@tanstack/react-query", load: () => import("./react-query.js") },
  { name: "@tanstack/react-router", load: () => import("./react-router.js") },
  { name: "@orpc/client", load: () => import("./orpc-client.js") },
  { name: "@orpc/client/fetch", load: () => import("./orpc-client-fetch.js") },
  {
    name: "@orpc/tanstack-query",
    load: () => import("./orpc-tanstack-query.js"),
  },
  { name: "@lingui/core", load: () => import("./lingui-core.js") },
  { name: "@lingui/react", load: () => import("./lingui-react.js") },
  { name: "radix-ui", load: () => import("./radix.js") },
  { name: "sonner", load: () => import("./sonner.js") },
  { name: "tailwind-merge", load: () => import("./tailwind-merge.js") },
];

// `default` / `module.exports` / `__esModule` are namespace artefacts whose
// value can legitimately be `undefined` — never treat them as a broken binding.
const ALWAYS_SKIPPED_KEYS = new Set([
  "default",
  "module.exports",
  "__esModule",
]);

describe("shim drift vs upstream packages", () => {
  test.each(SHIMS)(
    "$name shim re-exports only bindings upstream still provides",
    async ({ name, load }) => {
      const shim = await load();
      // A re-export wired to `ns.X` resolves to a real value when upstream
      // still provides `X`, and to `undefined` once upstream renames or removes
      // it. Surface those — they're the silent breakage for plugins.
      const broken = Object.keys(shim).filter(
        (k) => !ALWAYS_SKIPPED_KEYS.has(k) && shim[k] === undefined,
      );
      expect(
        broken,
        `Shim "${name}" re-exports bindings that no longer exist upstream: ` +
          `${broken.join(", ")}. Upstream renamed or removed them — update ` +
          `packages/plumix/src/admin/<shim>.ts.`,
      ).toEqual([]);
    },
  );
});
