import { describe, expect, test } from "vitest";

import type { DispatcherHarness } from "../../test/dispatcher.js";
import {
  createDispatcherHarness,
  plumixRequest,
} from "../../test/dispatcher.js";
import { SESSION_COOKIE_NAME } from "../cookies.js";
import { createSession } from "../sessions.js";
import { createAuthClient } from "./auth-client.js";

/** An auth client whose every request reaches core's real handlers. */
function clientOf(h: DispatcherHarness, token: string) {
  return createAuthClient({
    basePath: () => "",
    fetch: (url, init) => {
      const headers = new Headers(init.headers);
      headers.append("cookie", `${SESSION_COOKIE_NAME}=${token}`);
      return h.dispatch(plumixRequest(url, { ...init, headers }));
    },
    navigate: () => undefined,
  });
}

/** One user signed in on this device and on another. */
async function twoSessions() {
  const h = await createDispatcherHarness();
  const user = await h.seedUser("subscriber");
  const here = await createSession(h.db, { userId: user.id });
  const other = await createSession(h.db, { userId: user.id });
  return { h, user, here, other, ...clientOf(h, here.token) };
}

describe("authClient.sessions.list", () => {
  test("lists the user's sessions and marks this one current", async () => {
    const { authClient } = await twoSessions();

    const result = await authClient.sessions.list();

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(2);
    expect(result.data?.filter((s) => s.current)).toHaveLength(1);
  });

  test("resolves each session with its address, agent and dates as Dates", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("subscriber");
    const here = await createSession(h.db, {
      userId: user.id,
      ipAddress: "203.0.113.7",
      userAgent: "Firefox",
    });
    const { authClient } = clientOf(h, here.token);

    const result = await authClient.sessions.list();

    expect(result.data).toEqual([
      {
        id: here.session.id,
        ipAddress: "203.0.113.7",
        userAgent: "Firefox",
        createdAt: new Date(here.session.createdAt),
        expiresAt: new Date(here.session.expiresAt),
        current: true,
      },
    ]);
  });
});

describe("authClient.sessions.revoke", () => {
  test("revoking the other session leaves only this one", async () => {
    const { authClient, here, other } = await twoSessions();

    const result = await authClient.sessions.revoke(other.session.id);

    expect(result.data).toEqual({ id: other.session.id });
    const listed = await authClient.sessions.list();
    expect(listed.data?.map((s) => [s.id, s.current])).toEqual([
      [here.session.id, true],
    ]);
  });

  test("revoking this session resolves current_session, pointing at signOut", async () => {
    const { authClient, here } = await twoSessions();

    const result = await authClient.sessions.revoke(here.session.id);

    expect(result.error?.code).toBe("current_session");
    expect(result.error?.message.id).toBe("authClient.error.currentSession");
    const listed = await authClient.sessions.list();
    expect(listed.data).toHaveLength(2);
  });
});

describe("authClient.sessions.revokeOthers", () => {
  test("leaves only this session", async () => {
    const { h, user, here, authClient } = await twoSessions();
    await createSession(h.db, { userId: user.id });

    const result = await authClient.sessions.revokeOthers();

    expect(result.data).toEqual({ revoked: 2 });
    const listed = await authClient.sessions.list();
    expect(listed.data?.map((s) => [s.id, s.current])).toEqual([
      [here.session.id, true],
    ]);
  });
});

describe("a sessions answer the client can't read", () => {
  const calls = {
    list: (c: ReturnType<typeof createAuthClient>["authClient"]) =>
      c.sessions.list(),
    revoke: (c: ReturnType<typeof createAuthClient>["authClient"]) =>
      c.sessions.revoke("s1"),
    revokeOthers: (c: ReturnType<typeof createAuthClient>["authClient"]) =>
      c.sessions.revokeOthers(),
  };

  test.each(Object.keys(calls) as (keyof typeof calls)[])(
    "%s resolves unknown",
    async (name) => {
      const { authClient } = createAuthClient({
        basePath: () => "",
        fetch: () => Promise.resolve(Response.json({ json: { nope: 1 } })),
        navigate: () => undefined,
      });

      const result = await calls[name](authClient);

      expect(result.data).toBeNull();
      expect(result.error?.code).toBe("unknown");
    },
  );
});
