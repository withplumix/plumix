import { describe, expect, test } from "vitest";

import {
  createDispatcherHarness,
  plumixRequest,
} from "../../test/dispatcher.js";
import { SESSION_COOKIE_NAME } from "../cookies.js";

describe("passkey register — options", () => {
  test("bootstraps the first user and issues a challenge", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@cms.example" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      challenge: string;
      user: { name: string };
    };
    expect(body.user.name).toBe("admin@cms.example");
    expect(typeof body.challenge).toBe("string");
  });

  test("is race-safe on concurrent bootstraps of the same email", async () => {
    const h = await createDispatcherHarness();
    const two = await Promise.all([
      h.dispatch(
        plumixRequest("/_plumix/auth/passkey/register/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "same@cms.example" }),
        }),
      ),
      h.dispatch(
        plumixRequest("/_plumix/auth/passkey/register/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "same@cms.example" }),
        }),
      ),
    ]);
    for (const response of two) expect(response.status).toBe(200);
  });

  test("rejects an invalid email with 400", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
    );
    expect(response.status).toBe(400);
  });

  test("rejects unauthenticated register after bootstrap (registration closed)", async () => {
    const h = await createDispatcherHarness();
    await h.seedUser("admin");

    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "stranger@example.com" }),
      }),
    );
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("registration_closed");
  });

  test("authenticated caller adding another email is rejected (email_mismatch)", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("author");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "somebody-else@example.com" }),
      }),
      user.id,
    );
    const response = await h.dispatch(authed);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("email_mismatch");
  });

  test("authenticated user may enrol an additional device (own email)", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("editor");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      }),
      user.id,
    );
    const response = await h.dispatch(authed);
    expect(response.status).toBe(200);
  });

  test("unauthenticated options omits excludeCredentials (no user-existence oracle)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "first@example.com" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { excludeCredentials?: unknown };
    expect(body.excludeCredentials).toBeUndefined();
  });
});

describe("passkey verify — input validation", () => {
  test("register/verify with malformed body returns 400 (not 500)", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/register/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "x", type: "not-a-key" }),
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("invalid_input");
  });

  test("login/verify with wildly oversized payload fails schema, not oslo", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/passkey/login/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "a".repeat(2048),
          rawId: "a",
          type: "public-key",
          response: {
            clientDataJSON: "a",
            authenticatorData: "a",
            signature: "a",
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe("passkey signout", () => {
  test("clears the cookie even when no session exists", async () => {
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
  });

  test("invalidates an existing session", async () => {
    const h = await createDispatcherHarness();
    const user = await h.seedUser("admin");
    const authed = await h.authenticateRequest(
      plumixRequest("/_plumix/auth/signout", { method: "POST" }),
      user.id,
    );
    const response = await h.dispatch(authed);
    expect(response.status).toBe(200);
  });
});
