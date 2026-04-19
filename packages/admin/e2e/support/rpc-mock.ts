import type { Page, Route } from "@playwright/test";

import type { AuthSessionOutput } from "@plumix/core";

// The e2e webServer is just Vite — no real backend — so every /_plumix/rpc
// call is intercepted here and answered with a deterministic fixture.
// Individual specs declare the shape they want per procedure so route
// `beforeLoad` + component queries resolve without hitting the network.

// oRPC's StandardRPCSerializer wire format — `meta` is always present,
// empty array for payloads with no BigInt/Date/etc. transforms.
function rpcOk(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ json: body, meta: [] }),
  });
}

export async function mockRpc(
  page: Page,
  handlers: Record<string, unknown>,
): Promise<void> {
  await page.route("**/_plumix/rpc/**", (route) => {
    const url = route.request().url();
    for (const [suffix, body] of Object.entries(handlers)) {
      if (url.endsWith(suffix)) {
        return rpcOk(route, body);
      }
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

export function mockSession(
  page: Page,
  body: AuthSessionOutput,
): Promise<void> {
  return mockRpc(page, { "/auth/session": body });
}

// Fixture: an authed admin session. Reused across every spec that needs a
// logged-in user — specs override individual fields via spread if they need
// something specific.
export const AUTHED_ADMIN: AuthSessionOutput = {
  user: {
    id: 1,
    email: "admin@example.test",
    name: "Admin",
    avatarUrl: null,
    role: "admin",
  },
  needsBootstrap: false,
};
