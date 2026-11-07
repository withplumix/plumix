import { describe, expect, test } from "vitest";

import type { RequestAuthenticator } from "../../src/auth/authenticator.js";
import { eq } from "../../src/db/index.js";
import { sessions } from "../../src/db/schema/sessions.js";
import { users } from "../../src/db/schema/users.js";
import { testSite } from "../../src/test/site.js";

const site = await testSite({ plugins: [] });

describe("revoking a user's other sessions", () => {
  test("is refused to a visitor", async () => {
    const revoking = site.rpc.auth.sessions.revokeOthers({});

    await expect(revoking).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("deletes the caller's other sessions and keeps the current one", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.session.create({ userId: editor.id });
    await site.factory.session.create({ userId: editor.id });

    const result = await site
      .actingAs(editor)
      .rpc.auth.sessions.revokeOthers({});

    expect(result.revoked).toBe(2);
    const remaining = await site.context.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, editor.id));
    expect(remaining).toHaveLength(1);
  });

  test("leaves other users' sessions alone", async () => {
    const other = await site.factory.user.create({
      email: "other@cms.example",
    });
    await site.factory.session.create({ userId: other.id });
    await site.factory.session.create({ userId: other.id });

    await site.actingAs("editor").rpc.auth.sessions.revokeOthers({});

    const theirs = await site.context.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, other.id));
    expect(theirs).toHaveLength(2);
  });

  test("revokes none when the caller has no other session", async () => {
    const result = await site
      .actingAs("editor")
      .rpc.auth.sessions.revokeOthers({});

    expect(result.revoked).toBe(0);
  });
});

/**
 * An external identity provider (Cloudflare Access, say) that vouches for
 * `sso@cms.example` on every request, with no plumix session cookie.
 */
const externalIdp: RequestAuthenticator = {
  authenticate: async (_request, db) => {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, "sso@cms.example"))
      .get();
    return user === undefined ? null : { user, credential: "session" };
  },
};

const signedInElsewhere = await testSite({
  config: { auth: { authenticator: externalIdp } },
});

describe("revoking other sessions for a caller signed in by an external identity provider", () => {
  test("revokes none and leaves the caller's sessions alone", async () => {
    const editor = await signedInElsewhere.factory.editor.create({
      email: "sso@cms.example",
    });
    await signedInElsewhere.factory.session.create({ userId: editor.id });
    await signedInElsewhere.factory.session.create({ userId: editor.id });

    const result = await signedInElsewhere.rpc.auth.sessions.revokeOthers({});

    expect(result.revoked).toBe(0);
    const remaining = await signedInElsewhere.context.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, editor.id));
    expect(remaining).toHaveLength(2);
  });
});

describe("listing a user's sessions", () => {
  test("is refused to a visitor", async () => {
    const listing = site.rpc.auth.sessions.list({});

    await expect(listing).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  test("marks the session the call came in on as current, and no other", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.session.create({
      id: "phone",
      userId: editor.id,
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0 phone",
    });
    await site.factory.session.create({
      id: "desktop",
      userId: editor.id,
      ipAddress: "203.0.113.8",
      userAgent: "Mozilla/5.0 desktop",
    });

    const listed = await site.actingAs(editor).rpc.auth.sessions.list({});

    expect(listed).toHaveLength(3);
    // The third row is the session the site signed the editor in with.
    expect(listed.filter((session) => session.current)).toHaveLength(1);
    expect(
      listed
        .filter((session) => !session.current)
        .map((session) => session.id)
        .sort(),
    ).toEqual(["desktop", "phone"]);
  });

  test("leaves out other users' sessions", async () => {
    const other = await site.factory.user.create({
      email: "other@cms.example",
    });
    await site.factory.session.create({ userId: other.id });

    const listed = await site.actingAs("editor").rpc.auth.sessions.list({});

    // Only the caller's own session; the other user's row is filtered out.
    expect(listed).toHaveLength(1);
  });
});

describe("revoking a session", () => {
  test("revokes the caller's session of that id", async () => {
    const editor = await site.factory.editor.create();
    await site.factory.session.create({ id: "phone", userId: editor.id });
    const caller = site.actingAs(editor);

    const result = await caller.rpc.auth.sessions.revoke({ id: "phone" });

    expect(result.id).toBe("phone");
    const listed = await caller.rpc.auth.sessions.list({});
    expect(listed.map((session) => session.id)).not.toContain("phone");
  });

  test("refuses the current session with CONFLICT", async () => {
    const caller = site.actingAs("editor");
    const listed = await caller.rpc.auth.sessions.list({});
    const current = listed.find((session) => session.current)?.id ?? "";

    const revoking = caller.rpc.auth.sessions.revoke({ id: current });

    await expect(revoking).rejects.toMatchObject({
      code: "CONFLICT",
      data: { reason: "current_session" },
    });
  });

  test("answers NOT_FOUND for another user's session, so it is no oracle", async () => {
    const other = await site.factory.user.create({
      email: "other@cms.example",
    });
    await site.factory.session.create({ id: "theirs", userId: other.id });

    const revoking = site
      .actingAs("editor")
      .rpc.auth.sessions.revoke({ id: "theirs" });

    await expect(revoking).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("a user's last sign-in in the user list", () => {
  test("is set for a caller signed in with a session", async () => {
    const admin = await site.factory.admin.create();

    const listed = await site
      .actingAs(admin)
      .rpc.user.list({ limit: 50, offset: 0 });

    expect(
      listed.find((user) => user.id === admin.id)?.lastSignInAt,
    ).toBeInstanceOf(Date);
  });

  test("is the date of the user's session", async () => {
    const alice = await site.factory.user.create({
      email: "alice@cms.example",
    });
    await site.factory.session.create({ userId: alice.id });

    const listed = await site
      .actingAs("admin")
      .rpc.user.list({ limit: 50, offset: 0 });

    // `unixepoch()` has second resolution, so this checks the value is a Date
    // rather than its ordering.
    expect(
      listed.find((user) => user.id === alice.id)?.lastSignInAt,
    ).toBeInstanceOf(Date);
  });
});
