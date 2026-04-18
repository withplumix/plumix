import { describe, expect, test } from "vitest";

import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createRpcHarness } from "../test/rpc.js";

async function expectErrorCode(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`expected error ${code}, call resolved`);
  } catch (error) {
    if ((error as { code?: string }).code !== code) throw error;
  }
}

describe("authenticated middleware", () => {
  test("rejects when no session cookie is present", async () => {
    const { client } = await createRpcHarness();
    await expectErrorCode(client.post.list({}), "UNAUTHORIZED");
  });

  test("rejects when the session cookie is a bogus token", async () => {
    const bogus = await createRpcHarness({
      request: new Request("https://cms.example/", {
        headers: { cookie: `${SESSION_COOKIE_NAME}=bogus-token` },
      }),
    });
    await expectErrorCode(bogus.client.post.list({}), "UNAUTHORIZED");
  });

  test("accepts a valid session and reaches the handler", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const rows = await h.client.post.list({});
    expect(rows).toEqual([]);
  });
});
