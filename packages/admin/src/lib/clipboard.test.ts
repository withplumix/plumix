import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { copyText } from "./clipboard.js";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("copyText", () => {
  test("writes a promised value via ClipboardItem when available (gesture-safe path)", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public readonly data: Record<string, unknown>) {}
      },
    );

    await copyText(Promise.resolve("hello"));

    expect(write).toHaveBeenCalledOnce();
    const items = write.mock.calls[0]?.[0] as unknown[];
    expect(items).toHaveLength(1);
  });

  test("falls back to writeText for a promised value when ClipboardItem is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("ClipboardItem", undefined);

    await copyText(Promise.resolve("https://example.test/x"));

    expect(writeText).toHaveBeenCalledWith("https://example.test/x");
  });

  test("writes a plain string directly via writeText (fast path)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText, write } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(public readonly data: Record<string, unknown>) {}
      },
    );

    await copyText("plain");

    expect(writeText).toHaveBeenCalledWith("plain");
    expect(write).not.toHaveBeenCalled();
  });
});
