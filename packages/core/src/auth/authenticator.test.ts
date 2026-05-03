import { describe, expect, test } from "vitest";

import type { RequestAuthenticator } from "./authenticator.js";
import { userFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { sessionAuthenticator } from "./authenticator.js";
import { SESSION_COOKIE_NAME } from "./cookies.js";
import { createSession } from "./sessions.js";

describe("sessionAuthenticator", () => {
  test("returns null when the request has no session cookie", async () => {
    const db = await createTestDb();
    const request = new Request("https://cms.example/admin");

    const user = await sessionAuthenticator().authenticate(request, db);
    expect(user).toBeNull();
  });

  test("returns null for a malformed / unknown cookie", async () => {
    const db = await createTestDb();
    const request = new Request("https://cms.example/admin", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=not-a-real-token` },
    });

    const user = await sessionAuthenticator().authenticate(request, db);
    expect(user).toBeNull();
  });

  test("returns the user for a valid session cookie", async () => {
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: "alice@example.com",
      role: "editor",
    });
    const { token } = await createSession(db, { userId: seeded.id });
    const request = new Request("https://cms.example/admin", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    const user = await sessionAuthenticator().authenticate(request, db);
    expect(user?.id).toBe(seeded.id);
    expect(user?.email).toBe("alice@example.com");
  });
});

describe("RequestAuthenticator interface", () => {
  test("a one-method custom authenticator slots in", async () => {
    // Smoke test for the contract — any object satisfying the interface
    // can replace the default. Mirrors how `cfAccess()` (a future
    // factory) will be shaped: pure function from request → user.
    const db = await createTestDb();
    const seeded = await userFactory.transient({ db }).create({
      email: "trusted@enterprise.example",
      role: "admin",
    });

    const headerAuth: RequestAuthenticator = {
      authenticate(request) {
        const email = request.headers.get("x-trusted-email");
        if (!email) return Promise.resolve(null);
        // In a real implementation we'd look up by email here. The
        // test just confirms the shape compiles + runs.
        return Promise.resolve(seeded);
      },
    };

    const ok = await headerAuth.authenticate(
      new Request("https://cms.example/", {
        headers: { "x-trusted-email": "trusted@enterprise.example" },
      }),
      db,
    );
    expect(ok?.id).toBe(seeded.id);

    const empty = await headerAuth.authenticate(
      new Request("https://cms.example/"),
      db,
    );
    expect(empty).toBeNull();
  });
});
