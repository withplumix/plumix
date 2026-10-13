import { describe, expect, test } from "vitest";

import {
  clientOnlyPlaceholderLabel,
  isForbiddenIslandExport,
  shouldHydrate,
  shouldPrefetch,
} from "./island-mode.js";

describe("shouldHydrate", () => {
  test("does not hydrate in edit mode (static, selectable)", () => {
    expect(shouldHydrate("edit")).toBe(false);
  });

  test("hydrates in preview mode", () => {
    expect(shouldHydrate("preview")).toBe(true);
  });

  test("hydrates in live mode", () => {
    expect(shouldHydrate("live")).toBe(true);
  });

  test("hydrates when the mode marker is absent (ordinary page)", () => {
    expect(shouldHydrate(null)).toBe(true);
  });
});

describe("clientOnlyPlaceholderLabel", () => {
  test("labels the component export", () => {
    expect(clientOnlyPlaceholderLabel("Counter")).toBe("Client-only: Counter");
  });

  test("falls back to the default export name", () => {
    expect(clientOnlyPlaceholderLabel(null)).toBe("Client-only: default");
  });
});

describe("isForbiddenIslandExport", () => {
  test.each(["__proto__", "constructor", "prototype"])(
    "rejects %s as a component export",
    (name) => {
      expect(isForbiddenIslandExport(name)).toBe(true);
    },
  );

  test.each(["default", "Counter"])("accepts the export %s", (name) => {
    expect(isForbiddenIslandExport(name)).toBe(false);
  });
});

describe("shouldPrefetch", () => {
  test("skips prefetch for a load island, which hydrates at once", () => {
    expect(shouldPrefetch("load", "load")).toBe(false);
  });

  test("skips prefetch for a client-only island, which hydrates at once", () => {
    expect(shouldPrefetch("only", "load")).toBe(false);
  });

  test("skips prefetch when it would fire on the same trigger as hydration", () => {
    expect(shouldPrefetch("visible", "visible")).toBe(false);
  });

  test("prefetches on an earlier trigger than hydration", () => {
    expect(shouldPrefetch("interaction", "visible")).toBe(true);
  });
});
