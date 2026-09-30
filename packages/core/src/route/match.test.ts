import { describe, expect, test } from "vitest";

import type { RouteRule } from "./contract/intent.js";
import { matchRoute } from "./match.js";

function rule(pathname: string, priority = 50): RouteRule {
  return {
    pattern: new URLPattern({ pathname }),
    rawPattern: pathname,
    intent: { kind: "entry", entryType: "post" },
    priority,
    isPermalinkRoute: true,
  };
}

describe("matchRoute", () => {
  test("returns null when no rule matches", () => {
    const rules = [rule("/entries/:slug")];
    expect(matchRoute(new URL("https://cms.example/other"), rules)).toBeNull();
  });

  test("extracts named params", () => {
    const rules = [rule("/docs/:category/:slug")];
    const result = matchRoute(
      new URL("https://cms.example/docs/guides/setup"),
      rules,
    );
    expect(result?.params).toEqual({ category: "guides", slug: "setup" });
  });

  test("first match wins — iteration order is the caller's responsibility", () => {
    const rules = [rule("/a/:slug"), rule("/a/:slug")];
    const result = matchRoute(new URL("https://cms.example/a/hello"), rules);
    expect(result?.intent).toEqual({ kind: "entry", entryType: "post" });
  });
});
