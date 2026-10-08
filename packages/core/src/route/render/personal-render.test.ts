import { describe, expect, test } from "vitest";

import type {
  AppContext,
  AuthenticatedUser,
  Db,
} from "../../context/app-context.js";
import { createTestContext } from "../../test/context.js";
import {
  adminBarViewer,
  renderIsPersonal,
  trackPrincipalReads,
} from "./personal-render.js";

const subscriber: AuthenticatedUser = {
  id: 7,
  email: "member@cms.example",
  role: "subscriber",
  meta: {},
};

function contextFor(user: AuthenticatedUser | null): AppContext {
  return createTestContext({ db: {} as Db, user });
}

describe("trackPrincipalReads", () => {
  test("a render with no principal keeps its context and is never personal", () => {
    const ctx = contextFor(null);

    const tracked = trackPrincipalReads(ctx);

    expect(tracked).toBe(ctx);
    expect(tracked.user).toBeNull();
    expect(renderIsPersonal(ctx)).toBe(false);
  });

  test("a member's render is shared until something reads the principal", () => {
    const ctx = contextFor(subscriber);

    const tracked = trackPrincipalReads(ctx);

    expect(tracked.request).toBe(ctx.request);
    expect(tracked.locale).toBe(ctx.locale);
    expect(renderIsPersonal(ctx)).toBe(false);
  });

  test.each<[string, (ctx: AppContext) => unknown]>([
    ["reading ctx.user", (ctx) => ctx.user],
    ["reading ctx.tokenScopes", (ctx) => ctx.tokenScopes],
    ["calling ctx.auth.can()", (ctx) => ctx.auth.can("entry:post:read")],
  ])("%s marks the render personal", (_read, read) => {
    const ctx = contextFor(subscriber);
    const tracked = trackPrincipalReads(ctx);

    read(tracked);

    // The verdict is read off any derivation of the request's context.
    expect(renderIsPersonal(ctx)).toBe(true);
    expect(renderIsPersonal(tracked)).toBe(true);
  });

  test("the tracked context answers with the principal it tracks", () => {
    const ctx = contextFor(subscriber);

    const tracked = trackPrincipalReads(ctx);

    expect(tracked.user).toBe(subscriber);
    expect(tracked.tokenScopes).toBeNull();
    expect(tracked.auth.can("entry:post:read")).toBe(
      ctx.auth.can("entry:post:read"),
    );
  });

  test("a staff principal's render is personal before anything reads it", () => {
    const ctx = contextFor({ ...subscriber, role: "editor" });

    trackPrincipalReads(ctx);

    expect(renderIsPersonal(ctx)).toBe(true);
  });
});

describe("adminBarViewer", () => {
  test("is the staff principal the render phase decided on", () => {
    const editor: AuthenticatedUser = { ...subscriber, role: "editor" };
    const ctx = contextFor(editor);

    const tracked = trackPrincipalReads(ctx);

    expect(adminBarViewer(tracked)).toBe(editor);
    // Personal from the decision, before any read.
    expect(renderIsPersonal(tracked)).toBe(true);
  });

  test("is null for a subscriber, and asking does not read the principal", () => {
    const ctx = contextFor(subscriber);
    const tracked = trackPrincipalReads(ctx);

    expect(adminBarViewer(tracked)).toBeNull();
    expect(renderIsPersonal(tracked)).toBe(false);
  });

  test("follows the principal on a render no render phase began for", () => {
    const admin: AuthenticatedUser = { ...subscriber, role: "admin" };

    expect(adminBarViewer(contextFor(admin))).toBe(admin);
    expect(adminBarViewer(contextFor(subscriber))).toBeNull();
    expect(adminBarViewer(contextFor(null))).toBeNull();
  });
});
