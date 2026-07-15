import type { Db } from "plumix";
import { describe, expect, test } from "vitest";

import { DEMO_ADMIN, demoAuthenticator } from "./authenticator.js";

describe("demoAuthenticator", () => {
  test("authenticates every request as the demo admin", async () => {
    const request = new Request("https://demo.example/_plumix/admin");
    const result = await demoAuthenticator().authenticate(request, {} as Db);
    expect(result?.user.role).toBe("admin");
    expect(result?.user.id).toBe(DEMO_ADMIN.id);
    expect(result?.user.email).toBe(DEMO_ADMIN.email);
  });
});
