import { describe, expect, test, vi } from "vitest";

import { registerMediaAdmin } from "./index.js";

describe("registerMediaAdmin", () => {
  // Blocks register centrally via the synthesised admin bundle now; the admin
  // entry only contributes field types.
  test("registers all field types with the host", () => {
    const registerPluginFieldType = vi.fn();

    registerMediaAdmin({ registerPluginFieldType });

    expect(registerPluginFieldType).toHaveBeenCalledWith(
      "media",
      expect.anything(),
    );
    expect(registerPluginFieldType).toHaveBeenCalledWith(
      "mediaList",
      expect.anything(),
    );
    // Url-valued variant backing the Styles-tab background control.
    expect(registerPluginFieldType).toHaveBeenCalledWith(
      "mediaUrl",
      expect.anything(),
    );
    // Visual focal-point picker for the image block.
    expect(registerPluginFieldType).toHaveBeenCalledWith(
      "focalPoint",
      expect.anything(),
    );
  });

  test("warns and does not throw when the host global is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(() => registerMediaAdmin(undefined)).not.toThrow();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("window.plumix not initialized"),
    );
  });
});
