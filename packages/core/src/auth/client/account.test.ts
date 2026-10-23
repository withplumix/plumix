import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import type { UserRole } from "../../db/schema/users.js";
import type { JsonValue } from "../../json.js";
import type {
  CreateDispatcherHarnessOptions,
  DispatcherHarness,
} from "../../test/dispatcher.js";
import type { AccountPatch, RpcCall } from "./account.js";
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "../../csrf-header.js";
import { acquireEditLease, readEditLease } from "../../db/edit-lease.js";
import { users } from "../../db/schema/users.js";
import { definePlugin } from "../../plugin/define.js";
import { text } from "../../plugin/fields/index.js";
import {
  createDispatcherHarness,
  plumixRequest,
} from "../../test/dispatcher.js";
import { SESSION_COOKIE_NAME } from "../cookies.js";
import { createSession } from "../sessions.js";
import { createAccountStore } from "./account.js";
import { createAuthClient } from "./auth-client.js";
import { defineAuthMethodClient } from "./define.js";
import { failure, success } from "./result.js";

/** An auth client whose every request reaches core's real handlers. */
function clientOf(
  h: DispatcherHarness,
  token: string,
  dropsNext = new Set<string>(),
) {
  const procedures: string[] = [];
  const created = createAuthClient({
    basePath: () => "",
    fetch: async (url, init) => {
      const procedure = url.replace("/_plumix/rpc/", "");
      procedures.push(procedure);
      if (dropsNext.delete(procedure)) throw new TypeError("Failed to fetch");
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

/** The RPC half of an auth client, over core's real handlers. */
function rpcOf(h: DispatcherHarness, token: string): RpcCall {
  return async (procedure, input) => {
    const response = await h.dispatch(
      plumixRequest(`/_plumix/rpc/${procedure}`, {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=${token}`,
          "content-type": "application/json",
          [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
        },
        body: JSON.stringify({ json: input }),
      }),
    );
    const payload = (await response.json()) as JsonValue;
    return response.ok ? success(payload) : failure("unknown");
  };
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

    await authClient.account.update({ name: "First" });

    const second = await authClient.account.update({ name: "Second" });

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

  test("a meta key whose capability the user lacks resolves forbidden", async () => {
    const { authClient } = await signedInClient("subscriber", {
      plugins: [profiles],
    });
    // Safety: core's own registry declares no user meta; the plugin above does.
    const meta = { bio: "Hello", badge: "gold" } as AccountPatch["meta"];

    const result = await authClient.account.update({ name: "Badged", meta });

    expect(result.error?.code).toBe("forbidden");
  });

  test("a meta key whose capability the user lacks changes nothing", async () => {
    const { h, user, token, authClient } = await signedInClient("subscriber", {
      plugins: [profiles],
    });
    // Safety: core's own registry declares no user meta; the plugin above does.
    const meta = { bio: "Hello", badge: "gold" } as AccountPatch["meta"];

    await authClient.account.update({ name: "Badged", meta });

    const reread = clientOf(h, token).account;
    await nextChange(reread);
    expect(reread.read().account).toMatchObject({ name: user.name, meta: {} });
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

describe("authClient.account.setLocale", () => {
  const bilingual = { i18n: { defaultLocale: "en", locales: ["en", "ar"] } };

  test("stores an enabled locale on the session's user", async () => {
    const { h, user, authClient } = await signedInClient(
      "subscriber",
      bilingual,
    );

    const result = await authClient.account.setLocale("ar");

    expect(result).toEqual({ data: { locale: "ar" }, error: null });
    const row = await h.db.query.users.findFirst({
      where: eq(users.id, user.id),
    });
    expect(row?.meta).toMatchObject({ locale: "ar" });
  });

  test("a code the site hasn't enabled resolves locale_not_supported and stores nothing", async () => {
    const { h, user, authClient } = await signedInClient(
      "subscriber",
      bilingual,
    );

    const result = await authClient.account.setLocale("de");

    expect(result.error?.code).toBe("locale_not_supported");
    expect(result.error?.message.id).toBe(
      "authClient.error.localeNotSupported",
    );
    const row = await h.db.query.users.findFirst({
      where: eq(users.id, user.id),
    });
    expect(row?.meta).not.toHaveProperty("locale");
  });

  test("a profile save after it still lands, though the locale moved the token", async () => {
    const { authClient } = await signedInClient("subscriber", bilingual);
    await authClient.account.update({ name: "Before" });
    await authClient.account.setLocale("ar");

    const result = await authClient.account.update({ name: "After" });

    expect(result.error).toBeNull();
    expect(result.data?.name).toBe("After");
  });
});

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

  test("a load the network dropped resolves the update's error and stays pending", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("subscriber");
    const { token } = await createSession(h.db, { userId: user.id });
    const { authClient, account } = clientOf(h, token, new Set(["user/get"]));

    const result = await authClient.account.update({ name: "Offline" });

    expect(result.error?.code).toBe("network_error");
    expect(account.read()).toEqual({ account: null, isPending: true });
  });

  test("an update after a dropped load loads again and saves", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("subscriber");
    const { token } = await createSession(h.db, { userId: user.id });
    const { authClient } = clientOf(h, token, new Set(["user/get"]));
    await authClient.account.update({ name: "Offline" });

    const result = await authClient.account.update({ name: "Back online" });

    expect(result.error).toBeNull();
    expect(result.data?.name).toBe("Back online");
  });

  test("signing in on a page that loaded signed out gives it the account", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("subscriber");
    const { token } = await createSession(h.db, { userId: user.id });
    let cookie = "no-such-session";
    const { authClient, account, registerAuthMethodClients } = createAuthClient(
      {
        basePath: () => "",
        fetch: async (url, init) => {
          if (url.endsWith("/fixture/start")) {
            cookie = token;
            return Response.json({ userId: user.id });
          }
          const headers = new Headers(init.headers);
          headers.append("cookie", `${SESSION_COOKIE_NAME}=${cookie}`);
          return h.dispatch(plumixRequest(url, { ...init, headers }));
        },
        navigate: () => undefined,
      },
    );
    registerAuthMethodClients([
      defineAuthMethodClient("fixture", (kernel) => ({
        signIn: () => kernel.post("start"),
      })),
    ]);
    await nextChange(account);
    expect(account.read()).toEqual({ account: null, isPending: false });

    // Not in core's registry: the fixture is registered above.
    await (
      authClient.signIn as unknown as Record<string, () => Promise<unknown>>
    ).fixture?.();

    await expect.poll(() => account.read().account?.id).toBe(user.id);
  });

  test("signing out clears it", async () => {
    const { authClient, account } = await signedInClient();
    await authClient.account.update({ name: "Loaded" });

    await authClient.signOut();

    expect(account.read()).toEqual({ account: null, isPending: false });
  });

  test("clearing it while it loads leaves it cleared", async () => {
    const { h, token, session } = await signedInClient();
    await session.refresh();
    const rpc = rpcOf(h, token);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let answered: ReturnType<RpcCall> = Promise.resolve(success(null));
    const store = createAccountStore((procedure, input) => {
      const call = rpc(procedure, input);
      if (procedure !== "user/get") return call;
      answered = gate.then(() => call);
      return answered;
    }, session);
    store.subscribe(() => undefined);
    store.clear();

    release();
    await answered;

    expect(store.read()).toEqual({ account: null, isPending: false });
  });
});
