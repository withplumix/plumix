import { describe, expect, test } from "vitest";

import { readEditLease } from "../db/edit-lease.js";
import { authedCtx, createRpcHarness } from "../test/rpc.js";
import { mcpRouterClient } from "./router-client.js";

describe("mcpRouterClient", () => {
  test("takes an edit lease on surface mcp", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { id } = await h.factory.draft.create({ authorId: h.user.id });

    await mcpRouterClient(authedCtx(h)).entry.lease.acquire({ id });

    const lease = await readEditLease(h.db, { kind: "entry", id });
    expect(lease?.surface).toBe("mcp");
  });

  test("keeps the credential's surface when called through the plain client", async () => {
    const h = await createRpcHarness({ authAs: "editor" });
    const { id } = await h.factory.draft.create({ authorId: h.user.id });

    await h.client.entry.lease.acquire({ id });

    const lease = await readEditLease(h.db, { kind: "entry", id });
    expect(lease?.surface).toBe("admin");
  });
});
