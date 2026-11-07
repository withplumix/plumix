import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import type { JsonValue } from "../../json.js";
import type { FetchOptions } from "../../test/request.js";
import type { TestSite } from "../../test/site.js";
import type { DefaultRole } from "../../users/contract/roles.js";
import type { AccountPatch, RpcCall } from "./account.js";
import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "../../csrf-header.js";
import { acquireEditLease, readEditLease } from "../../db/edit-lease.js";
import { users } from "../../db/schema/users.js";
import { definePlugin } from "../../plugin/define.js";
import { text } from "../../plugin/fields/index.js";
import { testSite } from "../../test/site.js";
import { SESSION_COOKIE_NAME } from "../cookies.js";
import { createSession } from "../sessions.js";
import { createAccountStore } from "./account.js";
import { createAuthClient } from "./auth-client.js";
import { defineAuthMethodClient } from "./define.js";
import { failure, success } from "./result.js";

/** A profile box with a member-editable key and one only promoters may set. */
const profiles = definePlugin("profiles", {
  setup: (ctx) => {
    ctx.registerUserMetaBox("profile", {
      label: "Profile",
      fields: [
        text("bio").maxLength(10),
        text("badge").capability("user:promote"),
      ],
    });
  },
});

const site = await testSite({ plugins: [] });
const profileSite = await testSite({ plugins: [profiles] });
const bilingualSite = await testSite({
  plugins: [],
  config: { i18n: { defaultLocale: "en", locales: ["en", "ar"] } },
});

/** Sends a request to the site on the session `token` names, as the browser would. */
async function send(
  on: TestSite,
  token: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.append("cookie", `${SESSION_COOKIE_NAME}=${token}`);
  const page = await on.visit(url, {
    method: init.method as FetchOptions["method"],
    headers,
    body: init.body ?? undefined,
  });
  return new Response(page.body === "" ? null : page.body, {
    status: page.status,
    headers: page.headers,
  });
}

/** An auth client whose every request reaches the site's real handlers. */
function clientOf(on: TestSite, token: string, dropsNext = new Set<string>()) {
  const procedures: string[] = [];
  const created = createAuthClient({
    basePath: () => "",
    fetch: async (url, init) => {
      const procedure = url.replace("/_plumix/rpc/", "");
      procedures.push(procedure);
      if (dropsNext.delete(procedure)) throw new TypeError("Failed to fetch");
      return send(on, token, url, init);
    },
    navigate: () => undefined,
  });
  return { procedures, ...created };
}

async function signedInClient(
  role: DefaultRole = "member",
  on: TestSite = site,
) {
  const user = await on.factory.user.create({ role });
  const { token } = await createSession(on.context.db, { userId: user.id });
  return { user, token, ...clientOf(on, token) };
}

/** The RPC half of an auth client, over the site's real handlers. */
function rpcOf(on: TestSite, token: string): RpcCall {
  return async (procedure, input) => {
    const response = await send(on, token, `/_plumix/rpc/${procedure}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [CSRF_HEADER_NAME]: CSRF_HEADER_VALUE,
      },
      body: JSON.stringify({ json: input }),
    });
    const payload = (await response.json()) as JsonValue;
    return response.ok ? success(payload) : failure("unknown");
  };
}

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
    const { token, authClient, account } = await signedInClient();
    const otherTab = clientOf(site, token);
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
    const { user, authClient } = await signedInClient();
    const admin = await site.factory.admin.create();
    const resource = { kind: "user", id: user.id };
    await acquireEditLease(site.context.db, resource, {
      userId: admin.id,
      surface: "admin",
    });

    const result = await authClient.account.update({ name: "Owner wins" });

    expect(result.data?.name).toBe("Owner wins");
    const lease = await readEditLease(site.context.db, resource);
    expect(lease?.holder.id).toBe(user.id);
  });

  test("a meta key whose capability the user lacks resolves forbidden", async () => {
    const { authClient } = await signedInClient("member", profileSite);
    // Safety: core's own registry declares no user meta; the plugin above does.
    const meta = { bio: "Hello", badge: "gold" } as AccountPatch["meta"];

    const result = await authClient.account.update({ name: "Badged", meta });

    expect(result.error?.code).toBe("forbidden");
  });

  test("a meta key whose capability the user lacks changes nothing", async () => {
    const { user, token, authClient } = await signedInClient(
      "member",
      profileSite,
    );
    // Safety: core's own registry declares no user meta; the plugin above does.
    const meta = { bio: "Hello", badge: "gold" } as AccountPatch["meta"];

    await authClient.account.update({ name: "Badged", meta });

    const reread = clientOf(profileSite, token).account;
    await nextChange(reread);
    expect(reread.read().account).toMatchObject({ name: user.name, meta: {} });
  });

  test("a meta value its field refuses resolves invalid_input", async () => {
    const { authClient } = await signedInClient("member", profileSite);
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
    const { authClient } = clientOf(site, "no-such-session");

    const result = await authClient.account.update({ name: "Nobody" });

    expect(result.error?.code).toBe("unauthorized");
  });
});

describe("authClient.account.setLocale", () => {
  test("stores an enabled locale on the session's user", async () => {
    const { user, authClient } = await signedInClient("member", bilingualSite);

    const result = await authClient.account.setLocale("ar");

    expect(result).toEqual({ data: { locale: "ar" }, error: null });
    const row = await bilingualSite.context.db.query.users.findFirst({
      where: eq(users.id, user.id),
    });
    expect(row?.meta).toMatchObject({ locale: "ar" });
  });

  test("a code the site hasn't enabled resolves locale_not_supported and stores nothing", async () => {
    const { user, authClient } = await signedInClient("member", bilingualSite);

    const result = await authClient.account.setLocale("de");

    expect(result.error?.code).toBe("locale_not_supported");
    expect(result.error?.message.id).toBe(
      "authClient.error.localeNotSupported",
    );
    const row = await bilingualSite.context.db.query.users.findFirst({
      where: eq(users.id, user.id),
    });
    expect(row?.meta).not.toHaveProperty("locale");
  });

  test("a profile save after it still lands, though the locale moved the token", async () => {
    const { authClient } = await signedInClient("member", bilingualSite);
    await authClient.account.update({ name: "Before" });
    await authClient.account.setLocale("ar");

    const result = await authClient.account.update({ name: "After" });

    expect(result.error).toBeNull();
    expect(result.data?.name).toBe("After");
  });

  test("an account nobody loaded stays unloaded", async () => {
    const { authClient, procedures } = await signedInClient(
      "member",
      bilingualSite,
    );

    await authClient.account.setLocale("ar");

    expect(procedures).not.toContain("user/get");
  });

  test("an answer without a locale resolves unknown", async () => {
    const { session } = await signedInClient("member", bilingualSite);
    const store = createAccountStore(
      () => Promise.resolve(success({ json: {} })),
      session,
    );

    const result = await store.setLocale("ar");

    expect(result.error?.code).toBe("unknown");
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
    const { token } = await signedInClient();
    const { authClient, account } = clientOf(
      site,
      token,
      new Set(["user/get"]),
    );

    const result = await authClient.account.update({ name: "Offline" });

    expect(result.error?.code).toBe("network_error");
    expect(account.read()).toEqual({ account: null, isPending: true });
  });

  test("an update after a dropped load loads again and saves", async () => {
    const { token } = await signedInClient();
    const { authClient } = clientOf(site, token, new Set(["user/get"]));
    await authClient.account.update({ name: "Offline" });

    const result = await authClient.account.update({ name: "Back online" });

    expect(result.error).toBeNull();
    expect(result.data?.name).toBe("Back online");
  });

  test("signing in on a page that loaded signed out gives it the account", async () => {
    const user = await site.factory.member.create();
    const { token } = await createSession(site.context.db, {
      userId: user.id,
    });
    let cookie = "no-such-session";
    const { authClient, account, registerAuthMethodClients } = createAuthClient(
      {
        basePath: () => "",
        fetch: async (url, init) => {
          if (url.endsWith("/fixture/start")) {
            cookie = token;
            return Response.json({ userId: user.id });
          }
          return send(site, cookie, url, init);
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
    const { token, session } = await signedInClient();
    await session.refresh();
    const rpc = rpcOf(site, token);
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
