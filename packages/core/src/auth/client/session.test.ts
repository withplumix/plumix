import { describe, expect, test } from "vitest";

import type { UserRole } from "../../db/schema/users.js";
import type { DispatcherHarness } from "../../test/dispatcher.js";
import {
  createDispatcherHarness,
  plumixRequest,
} from "../../test/dispatcher.js";
import { SESSION_COOKIE_NAME } from "../cookies.js";
import { createSession } from "../sessions.js";
import { createAuthClient } from "./auth-client.js";

/** An auth client whose every request reaches core's real handlers. */
function clientOf(h: DispatcherHarness, token: string | null) {
  return createAuthClient({
    basePath: () => "",
    fetch: (url, init) => {
      const headers = new Headers(init.headers);
      if (token !== null) {
        headers.append("cookie", `${SESSION_COOKIE_NAME}=${token}`);
      }
      return h.dispatch(plumixRequest(url, { ...init, headers }));
    },
    navigate: () => undefined,
  });
}

async function signedInAs(role: UserRole) {
  const h = await createDispatcherHarness();
  const user = await h.seedUser(role);
  const { token } = await createSession(h.db, { userId: user.id });
  return clientOf(h, token);
}

describe("the session's capabilities", () => {
  test("a subscriber's session reports editing their own profile, not creating posts", async () => {
    const { session } = await signedInAs("subscriber");

    await session.refresh();

    const capabilities = session.read().user?.capabilities;
    expect(capabilities).toContain("user:edit_own");
    expect(capabilities).not.toContain("entry:post:create");
  });

  test("an editor's session reports editing any post", async () => {
    const { session } = await signedInAs("editor");

    await session.refresh();

    expect(session.read().user?.capabilities).toContain("entry:post:edit_any");
  });
});

describe("authClient.can", () => {
  test("is false while the session is pending", async () => {
    const { authClient } = await signedInAs("editor");

    expect(authClient.can("entry:post:edit_any")).toBe(false);
  });

  test("is false when signed out", async () => {
    const h = await createDispatcherHarness();
    await h.seedUser("admin");
    const { authClient, session } = clientOf(h, null);

    await session.refresh();

    expect(authClient.can("user:edit_own")).toBe(false);
  });

  test("answers from the signed-in session's capabilities", async () => {
    const { authClient, session } = await signedInAs("subscriber");

    await session.refresh();

    expect(authClient.can("user:edit_own")).toBe(true);
    expect(authClient.can("entry:post:create")).toBe(false);
  });

  test("turns false after sign-out", async () => {
    const { authClient, session } = await signedInAs("subscriber");
    await session.refresh();

    await authClient.signOut();

    expect(authClient.can("user:edit_own")).toBe(false);
  });
});
