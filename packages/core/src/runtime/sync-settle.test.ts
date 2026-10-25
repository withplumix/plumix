import { describe, expect, test } from "vitest";

import type { DispatcherHarness } from "../test/dispatcher.js";
import { sync } from "../hooks/sync.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

const SETTLE_URL = "https://cms.example/_plumix/api/v1/system/sync/settle";

function settleRequest(
  secret: string | undefined,
  body: unknown = { scopes: ["content"], direction: "push" },
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (secret !== undefined) headers.authorization = `Bearer ${secret}`;
  return new Request(SETTLE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function tokenFor(
  h: DispatcherHarness,
  role: "admin" | "editor",
): Promise<string> {
  const user = await h.factory.user.create({ role });
  const { secret } = await h.factory.apiToken.create({ userId: user.id });
  return secret;
}

describe("POST /_plumix/api/v1/system/sync/settle", () => {
  test("answers 401 without a token", async () => {
    const h = await createDispatcherHarness();

    const response = await h.dispatch(settleRequest(undefined));

    expect(response.status).toBe(401);
  });

  test("answers 403 for a token whose user may not manage settings", async () => {
    const h = await createDispatcherHarness();
    const secret = await tokenFor(h, "editor");

    const response = await h.dispatch(settleRequest(secret));

    expect(response.status).toBe(403);
  });

  test("runs the settle and answers with its report for a token whose user manages settings", async () => {
    const h = await createDispatcherHarness();
    const events: unknown[] = [];
    h.app.hooks.on(sync.after, (event) => {
      events.push(event);
    });
    const secret = await tokenFor(h, "admin");

    const response = await h.dispatch(
      settleRequest(secret, {
        scopes: ["content", "media"],
        direction: "pull",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ cdn: "none", failures: [] });
    expect(events).toEqual([
      { scopes: ["content", "media"], direction: "pull" },
    ]);
  });

  test("answers 400 for a body that is not a settle event", async () => {
    const h = await createDispatcherHarness();
    const secret = await tokenFor(h, "admin");

    const response = await h.dispatch(
      settleRequest(secret, { scopes: "content", direction: "sideways" }),
    );

    expect(response.status).toBe(400);
  });

  test("answers 405 to a GET", async () => {
    const h = await createDispatcherHarness();
    const secret = await tokenFor(h, "admin");

    const response = await h.dispatch(
      new Request(SETTLE_URL, {
        headers: { authorization: `Bearer ${secret}` },
      }),
    );

    expect(response.status).toBe(405);
  });
});
