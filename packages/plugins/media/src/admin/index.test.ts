import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  delete (globalThis as { window?: unknown }).window;
});

describe("media admin entry side effects", () => {
  test("registers every mediaBlocks spec via window.plumix.registerPluginBlock on load", async () => {
    const registerPluginBlock = vi.fn();
    const registerPluginFieldType = vi.fn();
    (globalThis as { window?: unknown }).window = {
      plumix: { registerPluginBlock, registerPluginFieldType },
    };

    vi.resetModules();
    // Import after resetModules so admin entry + mediaBlocks share the
    // same fresh module instance (object identity matters for the
    // toHaveBeenNthCalledWith spec assertions).
    await import("./index.js");
    const { mediaBlocks } = await import("../index.js");

    expect(registerPluginBlock).toHaveBeenCalledTimes(mediaBlocks.length);
    mediaBlocks.forEach((spec, i) => {
      expect(registerPluginBlock).toHaveBeenNthCalledWith(i + 1, spec);
    });
  });

  test("warns and does not throw when window.plumix is missing", async () => {
    (globalThis as { window?: unknown }).window = {};
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.resetModules();
    await expect(import("./index.js")).resolves.toBeDefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/window\.plumix not initialized/);
  });
});
