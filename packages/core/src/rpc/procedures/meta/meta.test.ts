import { describe, expect, test } from "vitest";

import { createRpcHarness } from "../../../test/rpc.js";

// A sweep rewrites content across the whole site, so it sits behind the
// site-wide admin gate rather than any per-type one.
describe("meta.sweep", () => {
  test("reports for an admin", async () => {
    const h = await createRpcHarness({ authAs: "admin" });

    const sweep = await h.client.meta.sweep({ write: false });

    expect(sweep).toEqual({ keys: [], settled: 0, next: null });
  });

  test("carries on from a cursor it handed back", async () => {
    const h = await createRpcHarness({ authAs: "admin" });

    const sweep = await h.client.meta.sweep({
      write: false,
      cursor: { store: "settings", after: 0 },
    });

    expect(sweep.next).toBeNull();
  });

  test("is refused to an editor", async () => {
    const h = await createRpcHarness({ authAs: "editor" });

    await expect(h.client.meta.sweep({ write: false })).rejects.toMatchObject({
      code: "FORBIDDEN",
      data: { capability: "settings:manage" },
    });
  });
});
