import { describe, expect, test } from "vitest";

import type { JsonObject } from "./json.js";
import type { RenderEnvPolicy } from "./render-env.js";
import type { PlumixContextValue } from "./renderer/context.js";
import { createBlockRegistry } from "./block-registry.js";
import { BASELINE_HTML_ALLOWLIST } from "./html/sanitize.js";
import {
  parseRenderEnv,
  RENDER_ENV_POLICY,
  serializeRenderEnv,
} from "./render-env.js";

describe("render env embed", () => {
  test("a context field the policy has not classified fails typecheck", () => {
    // Stands in for a new field on `PlumixContextValue`: if the policy were
    // loosened to an open bag this assignment would compile and the directive
    // below would fail the typecheck instead.
    type Grown = PlumixContextValue & { readonly sidebar?: JsonObject };
    // @ts-expect-error `sidebar` is neither carried nor classified
    const policy: RenderEnvPolicy<Grown> = RENDER_ENV_POLICY;
    expect(policy).toBe(RENDER_ENV_POLICY);
  });

  test("carries locale, the queried entry and site settings, losing what JSON can't hold", () => {
    const json = serializeRenderEnv(
      {
        registry: createBlockRegistry([]),
        locale: "de",
        entry: { title: "Sommer", publishedAt: new Date(Date.UTC(2026, 0, 2)) },
        siteSettings: { title: "Acme" },
        renderFilters: { beforeRender: (element) => element },
      },
      BASELINE_HTML_ALLOWLIST,
    );

    expect(parseRenderEnv(json)).toEqual({
      locale: "de",
      entry: { title: "Sommer", publishedAt: "2026-01-02T00:00:00.000Z" },
      siteSettings: { title: "Acme" },
      htmlAllowlist: BASELINE_HTML_ALLOWLIST,
    });
  });
});
