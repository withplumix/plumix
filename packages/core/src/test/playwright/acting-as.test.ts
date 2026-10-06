import { describe, expect, test, vi } from "vitest";

import { SESSION_COOKIE_NAME } from "../../auth/cookies.js";
import { userFactory } from "../factories.js";
import { createTestDb } from "../harness.js";
import { actingAs } from "./acting-as.js";

// A second Playwright worker is a second process: its factory sequence starts
// over at 1, and it loads its own copy of the factories module.
function loadSecondProcess() {
  vi.resetModules();
  return import("./acting-as.js");
}

describe("actingAs (Playwright)", () => {
  test("role string → creates a user with that role and a storageState carrying the session cookie", async () => {
    const db = await createTestDb();

    const { user, storageState } = await actingAs(db, "admin");

    expect(user.role).toBe("admin");
    expect(storageState.cookies).toHaveLength(1);
    const cookie = storageState.cookies[0];
    expect(cookie?.name).toBe(SESSION_COOKIE_NAME);
    expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(cookie?.domain).toBe("localhost");
    expect(cookie?.path).toBe("/");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(storageState.origins).toEqual([]);
  });

  test("User object → reuses the user and still mints a fresh session cookie", async () => {
    const db = await createTestDb();
    const existing = await userFactory
      .transient({ db })
      .create({ role: "editor" });

    const { user, storageState } = await actingAs(db, existing);

    expect(user.id).toBe(existing.id);
    expect(user.role).toBe("editor");
    expect(storageState.cookies[0]?.value).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });

  test("two consecutive calls mint distinct session tokens", async () => {
    const db = await createTestDb();

    const first = await actingAs(db, "admin");
    const second = await actingAs(db, "admin");

    expect(first.storageState.cookies[0]?.value).not.toBe(
      second.storageState.cookies[0]?.value,
    );
  });

  test("a second process seeding the same db mints a user that does not collide", async () => {
    const db = await createTestDb();

    userFactory.rewindSequence();
    const first = await actingAs(db, "subscriber");
    const second = await (await loadSecondProcess()).actingAs(db, "subscriber");

    expect(second.user.id).not.toBe(first.user.id);
    expect(second.user.slug).not.toBe(first.user.slug);
    expect(second.user.email).not.toBe(first.user.email);
  });
});
