import { describe, expect, test } from "vitest";

import { SESSION_COOKIE_NAME } from "../../../auth/cookies.js";
import { createRpcHarness } from "../../../test/rpc.js";

describe("auth.session", () => {
  test("empty instance → user: null, needsBootstrap: true", async () => {
    const h = await createRpcHarness();
    const result = await h.client.auth.session({});
    expect(result).toEqual({ user: null, needsBootstrap: true });
  });

  test("unauthed caller on a populated instance → user: null, needsBootstrap: false", async () => {
    const h = await createRpcHarness();
    await h.factory.user.create({ email: "someone@example.test" });
    const result = await h.client.auth.session({});
    expect(result).toEqual({ user: null, needsBootstrap: false });
  });

  test("authed caller returns full profile; needsBootstrap is false", async () => {
    const h = await createRpcHarness({ authAs: "admin" });
    const result = await h.client.auth.session({});
    expect(result.needsBootstrap).toBe(false);
    expect(result.user).toEqual({
      id: h.user.id,
      email: h.user.email,
      name: h.user.name,
      avatarUrl: h.user.avatarUrl,
      role: "admin",
    });
  });

  test("stale / unknown session cookie → user: null; bootstrap flag still correct", async () => {
    const request = new Request("https://cms.example/_plumix/rpc", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-real-token` },
    });
    const h = await createRpcHarness({ request });
    const emptyResult = await h.client.auth.session({});
    expect(emptyResult).toEqual({ user: null, needsBootstrap: true });

    await h.factory.user.create({ email: "real@example.test" });
    const populatedResult = await h.client.auth.session({});
    expect(populatedResult).toEqual({ user: null, needsBootstrap: false });
  });
});
