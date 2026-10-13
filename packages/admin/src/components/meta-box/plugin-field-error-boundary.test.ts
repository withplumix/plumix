import { describe, expect, test } from "vitest";

import { PluginFieldErrorBoundary } from "./plugin-field-error-boundary.js";

describe("PluginFieldErrorBoundary", () => {
  test("a plugin field render that throws is caught as the boundary's error", () => {
    const error = new Error("boom");
    expect(PluginFieldErrorBoundary.getDerivedStateFromError(error)).toEqual({
      error,
    });
  });

  test("a new reset key clears the caught error", () => {
    expect(
      PluginFieldErrorBoundary.getDerivedStateFromProps(
        {
          fieldKey: "k",
          inputType: "crashy",
          testId: "meta-box-field-k-input",
          resetKey: "good",
          children: null,
        },
        { error: new Error("boom"), resetKey: "bad" },
      ),
    ).toEqual({ error: null, resetKey: "good" });
  });

  test("the same reset key keeps the caught error", () => {
    expect(
      PluginFieldErrorBoundary.getDerivedStateFromProps(
        {
          fieldKey: "k",
          inputType: "crashy",
          testId: "meta-box-field-k-input",
          resetKey: "bad",
          children: null,
        },
        { error: new Error("boom"), resetKey: "bad" },
      ),
    ).toBeNull();
  });
});
