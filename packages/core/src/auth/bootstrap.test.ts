import { describe, expect, test } from "vitest";

import { createTestDb } from "../test/harness.js";
import { provisionUser } from "./bootstrap.js";

describe("first-user-admin bootstrap", () => {
  test("first user becomes admin regardless of requested defaultRole", async () => {
    const db = await createTestDb();
    const result = await provisionUser(db, {
      email: "first@example.com",
      defaultRole: "subscriber",
    });
    expect(result.bootstrapped).toBe(true);
    expect(result.user.role).toBe("admin");
  });

  test("subsequent users get the supplied defaultRole, never admin", async () => {
    const db = await createTestDb();
    await provisionUser(db, { email: "first@example.com" });
    const result = await provisionUser(db, {
      email: "second@example.com",
      defaultRole: "author",
    });
    expect(result.bootstrapped).toBe(false);
    expect(result.user.role).toBe("author");
  });
});
