import { describe, expect, test } from "vitest";

import { openMintedPreview } from "./open-minted-preview.js";

/** The tab `window.open` hands back, recording what the preview did to it. */
function fakeTab(): {
  opener: unknown;
  readonly location: { href: string };
  closed: boolean;
  readonly close: () => void;
} {
  const tab = {
    opener: {} as unknown,
    location: { href: "" },
    closed: false,
    close: () => {
      tab.closed = true;
    },
  };
  return tab;
}

describe("openMintedPreview", () => {
  test("points the opened tab at the minted URL and severs its opener", async () => {
    const tab = fakeTab();

    await openMintedPreview({
      open: () => tab,
      origin: "https://site.test",
      mint: () => Promise.resolve({ url: "/post/secret?preview=tok123" }),
    });

    expect(tab.location.href).toBe(
      "https://site.test/post/secret?preview=tok123",
    );
    expect(tab.opener).toBeNull();
  });

  test("a failed mint closes the tab it opened and rejects", async () => {
    const tab = fakeTab();

    const opening = openMintedPreview({
      open: () => tab,
      origin: "https://site.test",
      mint: () => Promise.reject(new Error("mint failed")),
    });

    await expect(opening).rejects.toThrow("mint failed");
    expect(tab.closed).toBe(true);
  });
});
