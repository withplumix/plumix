import { describe, expect, test } from "vitest";

import { defineTemplate, isTemplate, normalizeTemplate } from "./template.js";
import { ThemeRegistrationError } from "./theme-errors.js";

describe("defineTemplate", () => {
  test("returns a Template that `isTemplate` recognizes", () => {
    const tmpl = defineTemplate({ render: () => null });
    expect(isTemplate(tmpl)).toBe(true);
  });

  test("preserves the render function unchanged on the branded object", () => {
    const render = () => null;
    const tmpl = defineTemplate({ render });
    expect(tmpl.render).toBe(render);
  });

  test("a hand-written `{ render }` literal is NOT recognized as a Template", () => {
    // Locks the brand invariant — only `defineTemplate`'s output passes
    // `isTemplate`. A future deps / document-fragment field added to
    // the factory contract would otherwise be silently absent on a
    // plain literal.
    expect(isTemplate({ render: () => null })).toBe(false);
  });
});

describe("normalizeTemplate", () => {
  test("wraps a plain function into a branded Template (factory shape)", () => {
    // The wrapper invokes the legacy fn via `createElement` so React's
    // render pass handles hooks. Asserting that the returned ReactNode
    // is a React element whose `type` points at the original fn proves
    // the wiring without spinning up `renderToString`.
    const fn = () => null;
    const normalized = normalizeTemplate(fn, "index");
    expect(isTemplate(normalized)).toBe(true);
    const element = normalized.render({
      data: {} as unknown as Parameters<typeof normalized.render>[0]["data"],
      ctx: {} as unknown as Parameters<typeof normalized.render>[0]["ctx"],
    }) as unknown as { type: unknown; props: unknown };
    expect(element.type).toBe(fn);
  });

  test("passes a factory-built template through unchanged", () => {
    const tmpl = defineTemplate({ render: () => null });
    const normalized = normalizeTemplate(tmpl, "single");
    expect(normalized).toBe(tmpl);
  });

  test("rejects an unbranded `{ render: fn }` object with a typed error", () => {
    const unbranded = { render: () => null };
    expect(() => normalizeTemplate(unbranded, "archive")).toThrow(
      ThemeRegistrationError,
    );
  });
});
