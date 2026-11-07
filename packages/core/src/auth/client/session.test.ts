import { describe, expect, test } from "vitest";

import type { FetchOptions } from "../../test/request.js";
import type { TestSite } from "../../test/site.js";
import { testSite } from "../../test/site.js";
import { createAuthClient } from "./auth-client.js";

const site = await testSite({ plugins: [] });

/** An auth client whose every request reaches the site's real handlers. */
function clientOf(signedIn: TestSite) {
  return createAuthClient({
    basePath: () => "",
    fetch: async (url, init) => {
      const page = await signedIn.visit(url, {
        method: init.method as FetchOptions["method"],
        headers: init.headers,
        body: init.body ?? undefined,
      });
      return new Response(page.body === "" ? null : page.body, {
        status: page.status,
        headers: page.headers,
      });
    },
    navigate: () => undefined,
  });
}

describe("the session's capabilities", () => {
  test("a member's session reports editing their own profile, not creating posts", async () => {
    const { session } = clientOf(site.actingAs("member"));

    await session.refresh();

    const capabilities = session.read().user?.capabilities;
    expect(capabilities).toContain("user:edit_own");
    expect(capabilities).not.toContain("entry:post:create");
  });

  test("an editor's session reports editing any post", async () => {
    const { session } = clientOf(site.actingAs("editor"));

    await session.refresh();

    expect(session.read().user?.capabilities).toContain("entry:post:edit_any");
  });
});

describe("authClient.can", () => {
  test("is false while the session is pending", () => {
    const { authClient } = clientOf(site.actingAs("editor"));

    expect(authClient.can("entry:post:edit_any")).toBe(false);
  });

  test("is false when signed out", async () => {
    const { authClient, session } = clientOf(site);

    await session.refresh();

    expect(authClient.can("user:edit_own")).toBe(false);
  });

  test("answers from the signed-in session's capabilities", async () => {
    const { authClient, session } = clientOf(site.actingAs("member"));

    await session.refresh();

    expect(authClient.can("user:edit_own")).toBe(true);
    expect(authClient.can("entry:post:create")).toBe(false);
  });

  test("turns false after sign-out", async () => {
    const { authClient, session } = clientOf(site.actingAs("member"));
    await session.refresh();

    await authClient.signOut();

    expect(authClient.can("user:edit_own")).toBe(false);
  });
});
