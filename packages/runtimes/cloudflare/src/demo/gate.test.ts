import { describe, expect, test } from "vitest";

import { DEMO_REFUSED_AREAS, isBlockedInDemo } from "./gate.js";

describe("isBlockedInDemo", () => {
  test.each([
    // apiTokens: a token authenticates from anywhere, not just this tab.
    "/_plumix/rpc/auth/apiTokens/list",
    "/_plumix/rpc/auth/apiTokens/create",
    "/_plumix/rpc/auth/apiTokens/revoke",
    "/_plumix/rpc/auth/apiTokens/adminList",
    "/_plumix/rpc/auth/apiTokens/adminRevoke",
    // deviceAuthorization: approving a device mints a token for it.
    "/_plumix/rpc/auth/deviceFlow/lookup",
    "/_plumix/rpc/auth/deviceFlow/approve",
    "/_plumix/rpc/auth/deviceFlow/deny",
    "/_plumix/auth/device/code",
    "/_plumix/auth/device/token",
    // passkeys: registering one, or signing in with one, mints a credential.
    "/_plumix/rpc/auth/credentials/list",
    "/_plumix/rpc/auth/credentials/rename",
    "/_plumix/rpc/auth/credentials/delete",
    "/_plumix/auth/passkey/register/options",
    "/_plumix/auth/passkey/register/verify",
    "/_plumix/auth/passkey/login/options",
    "/_plumix/auth/passkey/login/verify",
    // oauthLinking: the callback links a provider account and mints a session.
    "/_plumix/auth/oauth/github/start",
    "/_plumix/auth/oauth/github/callback",
    // emailDelivery: each of these sends, or redeems, a real email.
    "/_plumix/rpc/user/invite",
    "/_plumix/auth/invite/register/options",
    "/_plumix/auth/invite/register/verify",
    "/_plumix/auth/magic-link/request",
    "/_plumix/auth/magic-link/verify",
    "/_plumix/rpc/user/requestEmailChange",
    "/_plumix/auth/verify-email",
    "/_plumix/rpc/auth/mailer/testSend",
  ])("refuses %s", (pathname) => {
    expect(isBlockedInDemo(pathname)).toBe(true);
  });

  test.each([
    // The admin's boot probe.
    "/_plumix/rpc/auth/session",
    "/_plumix/rpc/auth/signInMethods",
    // User management acts on the visitor's own sandbox database.
    "/_plumix/rpc/user/list",
    "/_plumix/rpc/user/get",
    "/_plumix/rpc/user/update",
    "/_plumix/rpc/user/disable",
    "/_plumix/rpc/user/enable",
    "/_plumix/rpc/user/delete",
    "/_plumix/rpc/user/setLocale",
    "/_plumix/rpc/user/pendingEmailChange",
    "/_plumix/rpc/user/cancelEmailChange",
    // Sessions and allowed domains are rows in the same sandbox.
    "/_plumix/rpc/auth/sessions/list",
    "/_plumix/rpc/auth/sessions/revoke",
    "/_plumix/rpc/auth/sessions/revokeOthers",
    "/_plumix/rpc/auth/allowedDomains/create",
    // Signing out clears a cookie; the demo session survives it.
    "/_plumix/auth/signout",
    // Content editing — the whole point of the demo.
    "/_plumix/rpc/entry/create",
    "/_plumix/rpc/term/update",
    "/_plumix/rpc/settings/upsert",
    "/_plumix/rpc/search/query",
    // A demo has no storage slot, so media procedures touch only the
    // per-session database.
    "/_plumix/rpc/media/delete",
    // The admin shell and public site.
    "/_plumix/admin/entries",
    "/",
    "/posts/hello-world",
  ])("allows %s", (pathname) => {
    expect(isBlockedInDemo(pathname)).toBe(false);
  });
});

describe("DEMO_REFUSED_AREAS", () => {
  test("names every admin area the gate refuses", () => {
    expect([...DEMO_REFUSED_AREAS].sort()).toEqual([
      "apiTokens",
      "deviceAuthorization",
      "emailDelivery",
      "oauthLinking",
      "passkeys",
    ]);
  });
});
