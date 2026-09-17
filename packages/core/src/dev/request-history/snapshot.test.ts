import { describe, expect, test } from "vitest";

import type {
  TelemetryRecord,
  TelemetrySpan,
} from "../../context/telemetry.js";
import type { DebugContextSource } from "./snapshot.js";
import { createPluginRegistry } from "../../plugin/manifest.js";
import {
  toRegisteredEntryType,
  toRegisteredTermTaxonomy,
} from "../../plugin/registry.js";
import { projectDebugSnapshot } from "./snapshot.js";

function ctxWith(
  overrides: Partial<DebugContextSource> = {},
): DebugContextSource {
  return {
    request: new Request("https://cms.example/blog/hello?secret=1"),
    origin: "https://cms.example",
    basePath: "",
    resolvedEntity: null,
    user: null,
    tokenScopes: null,
    locale: { code: "en", label: "English", direction: "ltr", enabled: true },
    plugins: createPluginRegistry(),
    ...overrides,
  };
}

function blogPlugins() {
  const plugins = createPluginRegistry();
  plugins.pluginIds.push("blog");
  plugins.entryTypes.set(
    "post",
    toRegisteredEntryType("post", { label: "Posts" }, "blog"),
  );
  plugins.termTaxonomies.set(
    "category",
    toRegisteredTermTaxonomy("category", { label: "Categories" }, "blog"),
  );
  return plugins;
}

const EMPTY = { spans: [], records: {} };

describe("projectDebugSnapshot", () => {
  test("projects the request/auth/app slice of the context", () => {
    const snap = projectDebugSnapshot(
      EMPTY,
      ctxWith({
        user: { id: 1, email: "a@b.c", role: "admin", meta: {} },
        tokenScopes: ["read:posts"],
        resolvedEntity: { kind: "entry", id: 7 },
        siteName: "My Site",
        cdn: { decorate: (response) => response },
        plugins: blogPlugins(),
      }),
    );

    expect(snap.context.method).toBe("GET");
    // Path only — the query string (a secret carrier) is never projected.
    expect(snap.context.path).toBe("/blog/hello");
    expect(snap.context.user).toEqual({ email: "a@b.c", role: "admin" });
    expect(snap.context.tokenScopes).toEqual(["read:posts"]);
    expect(snap.context.resolvedEntity).toEqual({ kind: "entry", id: 7 });
    expect(snap.context.siteName).toBe("My Site");
    expect(snap.context.slots).toEqual({
      cdn: true,
      storage: false,
      mailer: false,
      images: false,
    });
    expect(snap.context.plugins).toEqual({
      ids: ["blog"],
      entryTypes: ["post"],
      termTaxonomies: ["category"],
    });
  });

  test("defaults an unset site name and anonymous user to null", () => {
    const snap = projectDebugSnapshot(EMPTY, ctxWith());
    expect(snap.context.siteName).toBeNull();
    expect(snap.context.user).toBeNull();
  });

  test("carries the telemetry spans and records through unchanged", () => {
    const spans: readonly TelemetrySpan[] = [
      {
        name: "dispatch",
        startedAt: 0,
        durationMs: 1,
        status: "ok",
        attributes: {},
        children: [],
      },
    ];
    const records: Record<string, readonly TelemetryRecord[]> = {
      ns: [{ at: 1, data: { note: "hi" } }],
    };

    const snap = projectDebugSnapshot({ spans, records }, ctxWith());

    expect(snap.spans).toBe(spans);
    expect(snap.records).toBe(records);
  });
});
