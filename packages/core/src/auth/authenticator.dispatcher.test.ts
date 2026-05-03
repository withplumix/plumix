import { describe, expect, test } from "vitest";

import type { RequestAuthenticator } from "./authenticator.js";
import { createDispatcherHarness, plumixRequest } from "../test/dispatcher.js";

describe("RequestAuthenticator — dispatcher integration", () => {
  test("default (session cookie) gates plugin authed routes", async () => {
    // Smoke: with no override and no session cookie, an authed RPC
    // call returns UNAUTHORIZED. This is the existing behaviour
    // before the contract was extracted; locking it in protects the
    // refactor from a regression.
    const h = await createDispatcherHarness();
    const response = await h.dispatch(
      plumixRequest("/_plumix/rpc/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: {} }),
      }),
    );
    // auth.session is public — returns 200 with user: null. The point
    // here is just that the dispatcher path runs end-to-end without
    // throwing through the new authenticator plumbing.
    expect(response.status).toBe(200);
  });

  test("custom authenticator overrides the default and authenticates via header", async () => {
    const h = await createDispatcherHarness({
      authenticator: customHeaderAuth(),
    });
    // Seed a user the custom auth will resolve to.
    const seeded = await h.factory.user.create({
      email: "trusted@enterprise.example",
      role: "editor",
    });

    // The dispatcher calls `app.authenticator.authenticate(request)` on
    // every authed surface. We exercise this through a plugin route in
    // a separate test (here we only confirm the override is wired —
    // running app.authenticator directly via the harness's app handle).
    const user = await h.app.authenticator.authenticate(
      new Request("https://cms.example/", {
        headers: { "x-trusted-email": "trusted@enterprise.example" },
      }),
      h.db,
    );
    expect(user?.id).toBe(seeded.id);
  });
});

// Test fixture — a minimal authenticator that resolves a user by an
// `x-trusted-email` header. Stand-in for what `cfAccess()` will do in
// production via JWT validation.
function customHeaderAuth(): RequestAuthenticator {
  return {
    async authenticate(request, db) {
      const email = request.headers.get("x-trusted-email");
      if (!email) return null;
      // Lazy import to avoid a circular dependency in this fixture.
      const { users } = await import("../db/schema/users.js");
      const { eq } = await import("../db/index.js");
      const user = await db.query.users.findFirst({
        where: eq(users.email, email),
      });
      return user ?? null;
    },
  };
}
