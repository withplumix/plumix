import { describe, expect, test, vi } from "vitest";

import { CARD_PREVIEW_INPUT_TYPE } from "../preview-box.js";
import { registerOgAdmin } from "./index.js";

describe("registerOgAdmin", () => {
  test("registers the preview renderer under the type the meta box names", () => {
    const registerPluginFieldType = vi.fn();

    registerOgAdmin({ registerPluginFieldType });

    expect(registerPluginFieldType).toHaveBeenCalledWith(
      CARD_PREVIEW_INPUT_TYPE,
      expect.anything(),
    );
  });

  test("warns and does not throw when the host global is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => {
      registerOgAdmin(undefined);
    }).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("window.plumix not initialized"),
    );
  });
});
