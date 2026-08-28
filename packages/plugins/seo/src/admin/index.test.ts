import { describe, expect, test, vi } from "vitest";

import { SERP_PREVIEW_INPUT_TYPE } from "../preview-box.js";
import { registerSeoAdmin } from "./index.js";

describe("registerSeoAdmin", () => {
  test("registers the preview renderer under the type the meta box names", () => {
    const registerPluginFieldType = vi.fn();

    registerSeoAdmin({ registerPluginFieldType });

    expect(registerPluginFieldType).toHaveBeenCalledWith(
      SERP_PREVIEW_INPUT_TYPE,
      expect.anything(),
    );
  });

  test("warns and does not throw when the host global is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => {
      registerSeoAdmin(undefined);
    }).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("window.plumix not initialized"),
    );
  });
});
