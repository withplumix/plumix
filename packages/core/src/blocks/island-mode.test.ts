import { describe, expect, test } from "vitest";

import { clientOnlyPlaceholderLabel, shouldHydrate } from "./island-mode.js";

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
