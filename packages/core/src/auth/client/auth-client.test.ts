import { describe, expect, test } from "vitest";

import { createAuthClient } from "./auth-client.js";
import { defineAuthMethodClient } from "./define.js";

interface SentRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function serverAnswering(...responses: (() => Response)[]): {
  readonly sent: SentRequest[];
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
} {
  const sent: SentRequest[] = [];
  return {
    sent,
    fetch: (url, init) => {
      sent.push({ url, init });
      const respond = responses.shift();
      if (respond === undefined) throw new Error(`unexpected request ${url}`);
      return Promise.resolve(respond());
    },
  };
}

describe("authClient.signIn.magicLink", () => {
  test("posts to the base-pathed endpoint with the CSRF header and resolves the server's answer", async () => {
    const server = serverAnswering(() =>
      Response.json({ ok: true, message: "sent" }),
    );
    const { authClient } = createAuthClient({
      basePath: () => "/blog",
      fetch: server.fetch,
      navigate: () => undefined,
    });

    const result = await authClient.signIn.magicLink({
      email: "jane@example.test",
      redirectTo: "/account",
    });

    expect(result).toEqual({
      data: { ok: true, message: "sent" },
      error: null,
    });
    expect(server.sent).toHaveLength(1);
    const [request] = server.sent;
    expect(request?.url).toBe(
      "/blog/_plumix/auth/magic-link/request?redirectTo=%2Fblog%2Faccount",
    );
    expect(request?.init.method).toBe("POST");
    expect(request?.init.credentials).toBe("same-origin");
    expect(new Headers(request?.init.headers).get("x-plumix-request")).toBe(
      "1",
    );
    expect(JSON.parse(request?.init.body as string)).toEqual({
      email: "jane@example.test",
    });
  });

  test("a validation failure resolves the server's error code", async () => {
    const server = serverAnswering(() =>
      Response.json({ error: "invalid_input" }, { status: 400 }),
    );
    const { authClient } = createAuthClient({
      basePath: () => "",
      fetch: server.fetch,
      navigate: () => undefined,
    });

    const result = await authClient.signIn.magicLink({ email: "nope" });

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("invalid_input");
    expect(result.error?.message.id).toBe("authClient.error.invalidInput");
  });

  test("a network failure resolves network_error instead of throwing", async () => {
    const { authClient } = createAuthClient({
      basePath: () => "",
      fetch: () => Promise.reject(new TypeError("Failed to fetch")),
      navigate: () => undefined,
    });

    const result = await authClient.signIn.magicLink({
      email: "jane@example.test",
    });

    expect(result.data).toBeNull();
    expect(result.error?.code).toBe("network_error");
  });

  test("an error body that isn't JSON resolves unknown", async () => {
    const server = serverAnswering(
      () => new Response("Bad gateway", { status: 502 }),
    );
    const { authClient } = createAuthClient({
      basePath: () => "",
      fetch: server.fetch,
      navigate: () => undefined,
    });

    const result = await authClient.signIn.magicLink({
      email: "jane@example.test",
    });

    expect(result.error?.code).toBe("unknown");
  });
});

describe("a plugin's client half", () => {
  test("registered after its action was read, it still runs, under the method's base-pathed mount", async () => {
    const server = serverAnswering(() => Response.json({ started: true }));
    const { authClient, registerAuthMethodClients } = createAuthClient({
      basePath: () => "/blog",
      fetch: server.fetch,
      navigate: () => undefined,
    });
    // Not in core's registry: the playground's fixture plugin types it.
    const signIn = authClient.signIn as unknown as Record<
      string,
      () => Promise<unknown>
    >;
    const readEarly = signIn.fixture;

    registerAuthMethodClients([
      defineAuthMethodClient("fixture", (kernel) => ({
        signIn: () => kernel.post("start"),
      })),
    ]);
    const result = await readEarly?.();

    expect(result).toEqual({ data: { started: true }, error: null });
    expect(server.sent.map(({ url }) => url)).toEqual([
      "/blog/_plumix/auth/fixture/start",
    ]);
  });
});

describe("authClient.signIn.oauth", () => {
  test("navigates to the provider's base-pathed start URL", async () => {
    const visited: string[] = [];
    const { authClient } = createAuthClient({
      basePath: () => "/blog",
      fetch: () => Promise.reject(new Error("no request expected")),
      navigate: (url) => visited.push(url),
    });

    const result = await authClient.signIn.oauth("github", {
      redirectTo: "/account",
    });

    expect(visited).toEqual([
      "/blog/_plumix/auth/oauth/github/start?redirectTo=%2Fblog%2Faccount",
    ]);
    expect(result.error).toBeNull();
  });
});

describe("authClient.url", () => {
  const { authClient } = createAuthClient({
    basePath: () => "/blog",
    fetch: () => Promise.reject(new Error("no request expected")),
    navigate: () => undefined,
  });

  test("points a sign-out form at the base-pathed endpoint", () => {
    expect(authClient.url("signOut", { redirectTo: "/" })).toBe(
      "/blog/_plumix/auth/signout?redirectTo=%2Fblog",
    );
  });

  test("points at a method's route, or its mount when there is none", () => {
    expect(
      authClient.url(
        { method: "magic-link", route: "request" },
        { redirectTo: "/account" },
      ),
    ).toBe(
      "/blog/_plumix/auth/magic-link/request?redirectTo=%2Fblog%2Faccount",
    );
    expect(authClient.url({ method: "fixture" })).toBe(
      "/blog/_plumix/auth/fixture/",
    );
  });
});

describe("a call that signs someone in", () => {
  const fixtureClient = defineAuthMethodClient("fixture", (kernel) => ({
    signIn: (options: { redirectTo?: string } = {}) =>
      kernel.post("verify", {}, options),
  }));
  const signedIn = (): Response =>
    Response.json({ userId: 1, redirectTo: "/blog/account" });
  const session = (): Response =>
    Response.json({
      json: {
        user: { id: 1, email: "jane@example.test", name: null, role: "admin" },
      },
    });

  function signInThrough(server: ReturnType<typeof serverAnswering>) {
    const visited: string[] = [];
    const { authClient, registerAuthMethodClients } = createAuthClient({
      basePath: () => "/blog",
      fetch: server.fetch,
      navigate: (url) => visited.push(url),
    });
    registerAuthMethodClients([fixtureClient]);
    const signIn = (
      authClient.signIn as unknown as Record<
        string,
        (options?: { redirectTo?: string }) => Promise<unknown>
      >
    ).fixture;
    return {
      visited,
      signIn: (options?: { redirectTo?: string }) => signIn?.(options),
    };
  }

  test("refreshes the session, and navigates to the server's redirectTo when the call passed one", async () => {
    const server = serverAnswering(signedIn, session);
    const { visited, signIn } = signInThrough(server);

    await signIn({ redirectTo: "/account" });

    expect(server.sent.map(({ url }) => url)).toEqual([
      "/blog/_plumix/auth/fixture/verify?redirectTo=%2Fblog%2Faccount",
      "/blog/_plumix/rpc/auth/session",
    ]);
    expect(visited).toEqual(["/blog/account"]);
  });

  test("stays on the page when the call passed no redirectTo", async () => {
    const server = serverAnswering(signedIn, session);
    const { visited, signIn } = signInThrough(server);

    await signIn();

    expect(server.sent).toHaveLength(2);
    expect(visited).toEqual([]);
  });
});

describe("authClient.signOut", () => {
  test("posts to the base-pathed endpoint, refreshes the session and navigates where the server says", async () => {
    const server = serverAnswering(
      () => Response.json({ ok: true, redirectTo: "/blog" }),
      () => Response.json({ json: { user: null } }),
    );
    const visited: string[] = [];
    const { authClient } = createAuthClient({
      basePath: () => "/blog",
      fetch: server.fetch,
      navigate: (url) => visited.push(url),
    });

    const result = await authClient.signOut({ redirectTo: "/" });

    expect(result).toEqual({ data: { redirectTo: "/blog" }, error: null });
    expect(server.sent.map(({ url }) => url)).toEqual([
      "/blog/_plumix/auth/signout?redirectTo=%2Fblog",
      "/blog/_plumix/rpc/auth/session",
    ]);
    expect(visited).toEqual(["/blog"]);
  });

  test("leaves following an identity provider's logout URL to the caller that passed no redirectTo", async () => {
    const server = serverAnswering(
      () =>
        Response.json({ ok: true, redirectTo: "https://idp.example/logout" }),
      () => Response.json({ json: { user: null } }),
    );
    const visited: string[] = [];
    const { authClient } = createAuthClient({
      basePath: () => "",
      fetch: server.fetch,
      navigate: (url) => visited.push(url),
    });

    const result = await authClient.signOut();

    expect(result.data).toEqual({ redirectTo: "https://idp.example/logout" });
    expect(visited).toEqual([]);
  });
});
