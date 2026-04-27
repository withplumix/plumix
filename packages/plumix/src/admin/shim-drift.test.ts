import * as ReactNs from "react";
import * as ReactJsxRuntimeNs from "react/jsx-runtime";
import * as OrpcClientNs from "@orpc/client";
import * as OrpcClientFetchNs from "@orpc/client/fetch";
import * as OrpcTanstackQueryNs from "@orpc/tanstack-query";
import * as ReactQueryNs from "@tanstack/react-query";
import * as ReactRouterNs from "@tanstack/react-router";
import * as ReactDomNs from "react-dom";
import * as ReactDomClientNs from "react-dom/client";
import { beforeAll, describe, expect, test } from "vitest";

// Drift detection: when an upstream package adds a new public export,
// our shim should re-export it. This test fails CI when a shim falls
// behind upstream — at which point either add the missing export to
// the shim or extend `KNOWN_GAPS` below with a justification.

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
    },
  };
});

interface ShimSpec {
  readonly name: string;
  readonly upstream: Readonly<Record<string, unknown>>;
  readonly load: () => Promise<Readonly<Record<string, unknown>>>;
  readonly knownGaps?: ReadonlySet<string>;
}

// Names we deliberately don't re-export. Reasons:
//   - `module.exports` / `default` — namespace artefacts, not real exports
//   - `unstable_*` — explicit opt-out so plugin authors don't depend on
//     APIs that may break between minor versions
const SHIMS: readonly ShimSpec[] = [
  {
    name: "react",
    upstream: ReactNs,
    load: () => import("./react.js"),
  },
  {
    name: "react/jsx-runtime",
    upstream: ReactJsxRuntimeNs,
    load: () => import("./react-jsx-runtime.js"),
  },
  {
    name: "react-dom",
    upstream: ReactDomNs,
    load: () => import("./react-dom.js"),
  },
  {
    name: "react-dom/client",
    upstream: ReactDomClientNs,
    load: () => import("./react-dom-client.js"),
    // `version` leaks at runtime but isn't in @types/react-dom — skip
    // until the types include it.
    knownGaps: new Set(["version"]),
  },
  {
    name: "@tanstack/react-query",
    upstream: ReactQueryNs,
    load: () => import("./react-query.js"),
    knownGaps: new Set([
      // Internal singletons — plugin code reaches them via hooks
      // (useIsFetching etc.) instead.
      "focusManager",
      "notifyManager",
      "onlineManager",
      // Public hook, but its inferred return type references
      // `QueryErrorResetBoundaryValue` from react-query's internal
      // `_tsup-dts-rollup.js` — re-exporting trips TS2883 in our
      // `.d.ts` emit. Plugins that need error-boundary reset can read
      // it via the `QueryErrorResetBoundary` component (re-exported)
      // through context.
      "useQueryErrorResetBoundary",
      // Internal helpers + symbols — not part of the documented surface.
      "dataTagErrorSymbol",
      "dataTagSymbol",
      "defaultScheduler",
      "defaultShouldDehydrateMutation",
      "defaultShouldDehydrateQuery",
      "environmentManager",
      "isServer",
      "noop",
      "partialMatchKey",
      "shouldThrowError",
      "timeoutManager",
      "unsetMarker",
      // Experimental — explicit opt-out so plugin authors don't depend
      // on APIs the upstream may break between minors.
      "experimental_streamedQuery",
    ]),
  },
  {
    name: "@tanstack/react-router",
    upstream: ReactRouterNs,
    load: () => import("./react-router.js"),
    // Plugin pages mount inside admin's router via the catch-all
    // route — they don't construct routers, history, or file routes
    // themselves. Skip the advanced/internal helpers; revisit when a
    // plugin actually needs one (the failing test reminds us).
    knownGaps: new Set([
      "Asset",
      "Await",
      "Asyncify",
      "Block",
      "CatchBoundary",
      "CatchNotFound",
      "ClientOnly",
      "DEFAULT_PROTOCOL_ALLOWLIST",
      "DefaultGlobalNotFound",
      "DefaultNotFoundComponent",
      "ErrorComponent",
      "FileRoute",
      "FileRouteLoader",
      "HeadContent",
      "LazyRoute",
      "Match",
      "MatchRoute",
      "Matches",
      "NotFoundError",
      "NotFoundRoute",
      "PathParamError",
      "RootRoute",
      "Route",
      "RouteApi",
      "Router",
      "RouterContextProvider",
      "ScriptOnce",
      "Scripts",
      "SearchParamError",
      "Transitioner",
      "asyncBuildLocation",
      "cleanPath",
      "composeRewrites",
      "createBrowserHistory",
      "createControlledPromise",
      "createFileRoute",
      "createHashHistory",
      "createHistory",
      "createLazyFileRoute",
      "createLazyRoute",
      "createLink",
      "createMemoryHistory",
      "createRootRoute",
      "createRootRouteWithContext",
      "createRoute",
      "createRouteMask",
      "createRouter",
      "createRouterConfig",
      "createSerializationAdapter",
      "decode",
      "deepEqual",
      "defaultDeserializeError",
      "defaultParseSearch",
      "defaultSerializeError",
      "defaultStringifySearch",
      "defaultTransformer",
      "defer",
      "encode",
      "escapeJSON",
      "exactPathTest",
      "fileRouteRoutes",
      "functionalUpdate",
      "getInitialRouterMetadata",
      "getLocationChangeInfo",
      "getMatchedRoutes",
      "getRouteApi",
      "isMatch",
      "isModuleNotFoundError",
      "isPlainArray",
      "isPlainObject",
      "isResolvedRedirect",
      "joinPaths",
      "lazyFn",
      "lazyRouteComponent",
      "linkOptions",
      "matchByPath",
      "matchPathname",
      "parsePathname",
      "parseSearchWith",
      "pick",
      "preloadWarning",
      "processRouteTree",
      "removeBasepath",
      "removeTrailingSlash",
      "replaceEqualDeep",
      "resolvePath",
      "retainSearchParams",
      "rootRouteId",
      "rootRouteWithContext",
      "shallow",
      "stringifySearchWith",
      "stripSearchParams",
      "trimPath",
      "trimPathLeft",
      "trimPathRight",
      "useAwaited",
      "useElementScrollRestoration",
      "useHydrated",
      "useLayoutEffect",
      "useMatchRoute",
      "useTags",
      "warning",
    ]),
  },
  {
    name: "@orpc/client",
    upstream: OrpcClientNs,
    load: () => import("./orpc-client.js"),
  },
  {
    name: "@orpc/client/fetch",
    upstream: OrpcClientFetchNs,
    load: () => import("./orpc-client-fetch.js"),
  },
  {
    name: "@orpc/tanstack-query",
    upstream: OrpcTanstackQueryNs,
    load: () => import("./orpc-tanstack-query.js"),
    knownGaps: new Set([
      // Stream handling — adds future-flag risk; opt-in by name when
      // a plugin actually wants it.
      "experimental_serializableStreamedQuery",
    ]),
  },
];

const ALWAYS_SKIPPED_KEYS = new Set([
  "default",
  "module.exports",
  "__esModule",
]);

function publicKeysOf(
  ns: Readonly<Record<string, unknown>>,
): readonly string[] {
  return Object.keys(ns)
    .filter((k) => !ALWAYS_SKIPPED_KEYS.has(k))
    .filter((k) => !k.startsWith("_"))
    .filter((k) => !k.startsWith("unstable_"))
    .sort();
}

describe("shim drift vs upstream packages", () => {
  test.each(SHIMS)(
    "$name shim re-exports every public upstream value",
    async ({ name, upstream, load, knownGaps }) => {
      const shim = await load();
      const expected = publicKeysOf(upstream).filter((k) => !knownGaps?.has(k));
      const actual = publicKeysOf(shim);
      const missing = expected.filter((k) => !actual.includes(k));
      expect(
        missing,
        `Shim "${name}" is missing upstream exports: ${missing.join(", ")}. ` +
          `Add them to packages/plumix/src/admin/<shim>.ts, or extend ` +
          `KNOWN_GAPS in shim-drift.test.ts with a justification.`,
      ).toEqual([]);
    },
  );
});
