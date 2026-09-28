import { describe, expect, test } from "vitest";

import { isBlockedInDemo } from "./gate.js";

describe("isBlockedInDemo", () => {
  test.each([
    // Real auth flows — no real auth in the demo.
    "/_plumix/auth/passkey/login/options",
    "/_plumix/auth/magic-link/request",
    "/_plumix/auth/oauth/github/start",
    "/_plumix/auth/invite/register/verify",
    "/_plumix/auth/device/code",
    "/_plumix/auth/signout",
    // Auth management RPCs (tokens, sessions, credentials).
    "/_plumix/rpc/auth/apiTokens/create",
    "/_plumix/rpc/auth/sessions/revoke",
    "/_plumix/rpc/auth/credentials/list",
    // User management — can't invite/create real users.
    "/_plumix/rpc/user/invite",
    "/_plumix/rpc/user/delete",
  ])("blocks %s", (pathname) => {
    expect(isBlockedInDemo(pathname)).toBe(true);
  });

  test.each([
    // The admin's boot probe must work despite the auth prefix.
    "/_plumix/rpc/auth/session",
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
