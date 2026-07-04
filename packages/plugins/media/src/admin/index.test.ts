import { describe, expect, test, vi } from "vitest";

import { mediaBlocks } from "../media-blocks.js";
import { registerMediaAdmin } from "./index.js";

describe("registerMediaAdmin", () => {
  test("registers every mediaBlocks spec and all field types with the host", () => {
    const registerPluginBlock = vi.fn();
    const registerPluginFieldType = vi.fn();

    registerMediaAdmin({ registerPluginBlock, registerPluginFieldType });

    expect(registerPluginBlock).toHaveBeenCalledTimes(mediaBlocks.length);
    mediaBlocks.forEach((spec, i) => {
      expect(registerPluginBlock).toHaveBeenNthCalledWith(i + 1, spec);
    });
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
