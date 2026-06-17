import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { copyText } from "./clipboard.js";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("copyText", () => {
  test("writes a ClipboardItem when the API is available (gesture-safe path)", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public readonly data: Record<string, unknown>) {}
      },
    );

    await copyText("hello");

    expect(write).toHaveBeenCalledOnce();
    const items = write.mock.calls[0]?.[0] as unknown[];
    expect(items).toHaveLength(1);
  });

  test("resolves a promised value before writing", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("ClipboardItem", undefined);

    await copyText(Promise.resolve("https://example.test/x"));

    expect(writeText).toHaveBeenCalledWith("https://example.test/x");
  });

  test("falls back to writeText when ClipboardItem is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("ClipboardItem", undefined);

    await copyText("plain");

    expect(writeText).toHaveBeenCalledWith("plain");
  });
});
