import { describe, expect, test } from "vitest";

import type { UserRole } from "../../db/schema/users.js";
import type {
  CreateDispatcherHarnessOptions,
  DispatcherHarness,
} from "../../test/dispatcher.js";
import type { AccountPatch } from "./account.js";
import { acquireEditLease, readEditLease } from "../../db/edit-lease.js";
import { definePlugin } from "../../plugin/define.js";
import { text } from "../../plugin/fields/index.js";
import {
  createDispatcherHarness,
  plumixRequest,
} from "../../test/dispatcher.js";
import { SESSION_COOKIE_NAME } from "../cookies.js";
import { createSession } from "../sessions.js";
import { createAuthClient } from "./auth-client.js";

/** An auth client whose every request reaches core's real handlers. */
function clientOf(h: DispatcherHarness, token: string) {
  const procedures: string[] = [];
  const created = createAuthClient({
    basePath: () => "",
    fetch: (url, init) => {
      procedures.push(url.replace("/_plumix/rpc/", ""));
      const headers = new Headers(init.headers);
      headers.append("cookie", `${SESSION_COOKIE_NAME}=${token}`);
      return h.dispatch(plumixRequest(url, { ...init, headers }));
    },
    navigate: () => undefined,
  });
  return { procedures, ...created };
}

async function signedInClient(
  role: UserRole = "subscriber",
  config?: CreateDispatcherHarnessOptions["config"],
) {
  const h = await createDispatcherHarness({ config });
  const user = await h.seedUser(role);
  const { token } = await createSession(h.db, { userId: user.id });
  return { h, user, token, ...clientOf(h, token) };
}

/** A profile box with a member-editable key and one only promoters may set. */
const profiles = definePlugin("profiles", (ctx) => {
  ctx.registerUserMetaBox("profile", {
    label: "Profile",
    fields: [
      text("bio").maxLength(10),
      text("badge").capability("user:promote"),
    ],
  });
});

describe("authClient.account.update", () => {
  test("renames the session's user, and the session shows the new name", async () => {
    const { authClient, session } = await signedInClient();

    const result = await authClient.account.update({ name: "Renamed Reader" });

    expect(result.error).toBeNull();
    expect(result.data?.name).toBe("Renamed Reader");
    expect(session.read().user?.name).toBe("Renamed Reader");
  });

  test("a second save in a row sends the token the first returned", async () => {
    const { authClient, procedures } = await signedInClient();

    const first = await authClient.account.update({ name: "First" });
    const second = await authClient.account.update({ name: "Second" });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data?.name).toBe("Second");
    expect(procedures.filter((p) => p === "user/get")).toHaveLength(1);
  });

  test("a copy another tab saved over resolves etag_mismatch, reloads, and saves on retry", async () => {
    const { h, token, authClient, account } = await signedInClient();
    const otherTab = clientOf(h, token);
    await authClient.account.update({ name: "Mine" });
    await otherTab.authClient.account.update({ name: "Theirs" });

    const stale = await authClient.account.update({ name: "Mine again" });

    expect(stale.error?.code).toBe("etag_mismatch");
    expect(stale.error?.message.id).toBe("authClient.error.etagMismatch");
    expect(account.read().account?.name).toBe("Theirs");
    const retry = await authClient.account.update({ name: "Mine again" });
    expect(retry.data?.name).toBe("Mine again");
  });

  test("saves while an admin holds the user's edit lease, taking it over", async () => {
    const { h, user, authClient } = await signedInClient();
    const admin = await h.seedUser("admin");
    const resource = { kind: "user", id: user.id };
    await acquireEditLease(h.db, resource, {
      userId: admin.id,
      surface: "admin",
    });

    const result = await authClient.account.update({ name: "Owner wins" });

    expect(result.data?.name).toBe("Owner wins");
    const lease = await readEditLease(h.db, resource);
    expect(lease?.holder.id).toBe(user.id);
  });

  test("a meta key whose capability the user lacks resolves forbidden and changes nothing", async () => {
    const { h, user, token, authClient } = await signedInClient("subscriber", {
      plugins: [profiles],
    });
    // Safety: core's own registry declares no user meta; the plugin above does.
    const meta = { bio: "Hello", badge: "gold" } as AccountPatch["meta"];

    const result = await authClient.account.update({ name: "Badged", meta });

    expect(result.error?.code).toBe("forbidden");
    const reread = await clientOf(h, token).authClient.account.update({});
    expect(reread.data).toMatchObject({ name: user.name, meta: {} });
  });

  test("a meta value its field refuses resolves invalid_input", async () => {
    const { authClient } = await signedInClient("subscriber", {
      plugins: [profiles],
    });
    // Safety: core's own registry declares no user meta; the plugin above does.
    const meta = { bio: "Far longer than ten" } as AccountPatch["meta"];

    const result = await authClient.account.update({ meta });

    expect(result.error?.code).toBe("invalid_input");
  });

  test("an avatar URL that isn't one resolves invalid_input", async () => {
    const { authClient } = await signedInClient();

    const result = await authClient.account.update({ avatarUrl: "not a url" });

    expect(result.error?.code).toBe("invalid_input");
  });

  test("signed out, it resolves unauthorized", async () => {
    const h = await createDispatcherHarness();
    const { authClient } = clientOf(h, "no-such-session");

    const result = await authClient.account.update({ name: "Nobody" });

    expect(result.error?.code).toBe("unauthorized");
  });
});

/** Resolves on the store's next change. */
function nextChange(store: { subscribe: (listener: () => void) => unknown }) {
  return new Promise<void>((resolve) => {
    store.subscribe(resolve);
  });
}

describe("the account useAccount reads", () => {
  test("loads the session's user on first use, holding no token a theme can see", async () => {
    const { user, account } = await signedInClient();
    expect(account.read()).toEqual({ account: null, isPending: true });

    await nextChange(account);

    expect(account.read()).toEqual({
      account: { id: user.id, name: user.name, avatarUrl: null, meta: {} },
      isPending: false,
    });
  });

  test("signing out clears it", async () => {
    const { authClient, account } = await signedInClient();
    await authClient.account.update({ name: "Loaded" });

    await authClient.signOut();

    expect(account.read()).toEqual({ account: null, isPending: false });
  });
});
