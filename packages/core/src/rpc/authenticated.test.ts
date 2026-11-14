import type { RouterClient } from "@orpc/server";
import { createRouterClient } from "@orpc/server";
import { describe, expect, test } from "vitest";

import { authedCtx, createRpcHarness, tokenCtx } from "../test/rpc.js";
import { appRouter } from "./router.js";

type Client = RouterClient<typeof appRouter>;

/** Every procedure behind `sessionAuthenticated` (ADR 0024). */
const SESSION_ONLY: readonly [string, (client: Client) => Promise<unknown>][] =
  [
    ["auth.apiTokens.create", (c) => c.auth.apiTokens.create({ name: "x" })],
    ["auth.deviceFlow.approve", (c) => c.auth.deviceFlow.approve(never())],
    ["auth.oauthConsent.lookup", (c) => c.auth.oauthConsent.lookup(never())],
    ["auth.oauthConsent.approve", (c) => c.auth.oauthConsent.approve(never())],
    ["user.requestEmailChange", (c) => c.user.requestEmailChange(never())],
  ];

/** Never validated: the middleware refuses before the input is read. */
function never<T>(): T {
  return {} as T;
}

describe("sessionAuthenticated", () => {
  test.each(SESSION_ONLY)(
    "%s refuses a context resolved from an API token",
    async (_name, call) => {
      const h = await createRpcHarness({ authAs: "admin" });
      const client = createRouterClient(appRouter, {
        context: tokenCtx(h, null),
      });

      await expect(call(client)).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    },
  );

  test("admits a context resolved from a session", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const client = createRouterClient(appRouter, { context: authedCtx(h) });

    const created = await client.auth.apiTokens.create({ name: "mine" });

    expect(created.token.name).toBe("mine");
  });
});

describe("authenticated", () => {
  test("runs a context resolved from an API token as its principal", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const client = createRouterClient(appRouter, {
      context: tokenCtx(h, null),
    });

    await expect(client.auth.apiTokens.list({})).resolves.toEqual([]);
  });
});
