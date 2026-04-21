import { describe, expect, test } from "vitest";

import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createRpcHarness } from "../test/rpc.js";
import { expectError } from "../test/spies.js";

describe("authenticated middleware", () => {
  test("rejects when no session cookie is present", async () => {
    const { client } = await createRpcHarness();
    await expectError(client.entry.list({}), { code: "UNAUTHORIZED" });
  });

  test("rejects when the session cookie is a bogus token", async () => {
    const bogus = await createRpcHarness({
      request: new Request("https://cms.example/", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=bogus-token` },
      }),
    });
    await expectError(bogus.client.entry.list({}), { code: "UNAUTHORIZED" });
  });

  test("accepts a valid session and reaches the handler", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const rows = await h.client.entry.list({});
    expect(rows).toEqual([]);
  });
});
