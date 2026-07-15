import type { Db } from "plumix";
import { describe, expect, test } from "vitest";

import { DEMO_ADMIN, demoAuthenticator } from "./authenticator.js";
import { DEMO_SHOWCASE_NAME } from "./session.js";

const withSession = new Request("https://demo.example/_plumix/admin", {
  headers: { cookie: "plumix_demo=abc123" },
});
const withoutSession = new Request("https://demo.example/");
const forgedShowcase = new Request("https://demo.example/_plumix/admin", {
  headers: { cookie: `plumix_demo=${DEMO_SHOWCASE_NAME}` },
});

describe("demoAuthenticator", () => {
  test("authenticates a session-cookie request as the demo admin", async () => {
    const result = await demoAuthenticator().authenticate(
      withSession,
      {} as Db,
    );
    expect(result?.user.role).toBe("admin");
    expect(result?.user.id).toBe(DEMO_ADMIN.id);
    expect(result?.user.email).toBe(DEMO_ADMIN.email);
  });

  test("stays anonymous without a session cookie", async () => {
    const result = await demoAuthenticator().authenticate(
      withoutSession,
      {} as Db,
    );
    expect(result).toBeNull();
  });

  test("rejects a cookie forging the reserved showcase name", async () => {
    const result = await demoAuthenticator().authenticate(
      forgedShowcase,
      {} as Db,
    );
    expect(result).toBeNull();
  });
});
