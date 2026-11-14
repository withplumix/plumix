import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app-context.js";
import type { DefaultRole } from "../../users/contract/roles.js";
import { block } from "../../events-and-filters/block-render.js";
import { definePlugin } from "../../plugin/define.js";
import { testSite } from "../../test/site.js";
import {
  adminBarViewer,
  renderIsPersonal,
  trackPrincipalReads,
} from "./personal-render.js";

const readsUser = definePlugin("reads-user", {
  setup: (ctx) => {
    ctx.filters.add(block.beforeRender, (element, _input, handlerCtx) => {
      void handlerCtx.user;
      return element;
    });
  },
});

const site = await testSite({ plugins: [readsUser] });

function adminAccessFrom(grantTo: readonly DefaultRole[]) {
  return definePlugin("admin-access", {
    setup: (ctx) => {
      ctx.registerCapability("admin:access", { grantTo });
    },
  });
}

const grantedToNoOne = await testSite({ plugins: [adminAccessFrom([])] });
const grantedToMembers = await testSite({
  plugins: [adminAccessFrom(["member"])],
});

describe("trackPrincipalReads", () => {
  test("a render with no principal keeps its context and is never personal", () => {
    const ctx = site.context;

    const tracked = trackPrincipalReads(ctx);

    expect(tracked).toBe(ctx);
    expect(tracked.user).toBeNull();
    expect(renderIsPersonal(ctx)).toBe(false);
  });

  test("a member's render is shared until something reads the principal", async () => {
    const member = await site.factory.user.create({ role: "member" });
    const ctx = site.actingAs(member).context;

    const tracked = trackPrincipalReads(ctx);

    expect(tracked.request).toBe(ctx.request);
    expect(tracked.locale).toBe(ctx.locale);
    expect(renderIsPersonal(ctx)).toBe(false);
  });

  test.each<[string, (ctx: AppContext) => unknown]>([
    ["reading ctx.user", (ctx) => ctx.user],
    ["reading ctx.tokenScopes", (ctx) => ctx.tokenScopes],
    ["reading ctx.apiToken", (ctx) => ctx.apiToken],
    ["reading ctx.credential", (ctx) => ctx.credential],
    ["calling ctx.auth.can()", (ctx) => ctx.auth.can("entry:post:read")],
  ])("%s marks the render personal", async (_read, read) => {
    const member = await site.factory.user.create({ role: "member" });
    const ctx = site.actingAs(member).context;
    const tracked = trackPrincipalReads(ctx);

    read(tracked);

    // The verdict is read off any derivation of the request's context.
    expect(renderIsPersonal(ctx)).toBe(true);
    expect(renderIsPersonal(tracked)).toBe(true);
  });

  test("the tracked context answers with the principal it tracks", async () => {
    const member = await site.factory.user.create({
      role: "member",
      email: "member@cms.example",
    });
    const ctx = site.actingAs(member).context;

    const tracked = trackPrincipalReads(ctx);

    expect(tracked.user).toMatchObject({
      id: member.id,
      email: "member@cms.example",
      role: "member",
    });
    expect(tracked.tokenScopes).toBeNull();
    expect(tracked.auth.can("entry:post:read")).toBe(
      ctx.auth.can("entry:post:read"),
    );
  });

  test("a handler a render fires gets the tracked context, so its read of the principal marks the render personal", async () => {
    const member = await site.factory.user.create({ role: "member" });
    const ctx = site.actingAs(member).context;
    const tracked = trackPrincipalReads(ctx);
    expect(renderIsPersonal(ctx)).toBe(false);

    void tracked.filters.apply(block.beforeRender, null, {
      node: { id: "n", name: "paragraph" },
      context: {} as never,
    });

    expect(renderIsPersonal(ctx)).toBe(true);
  });

  test("a staff principal's render is personal before anything reads it", async () => {
    const editor = await site.factory.user.create({ role: "editor" });
    const ctx = site.actingAs(editor).context;

    trackPrincipalReads(ctx);

    expect(renderIsPersonal(ctx)).toBe(true);
  });
});

describe("adminBarViewer", () => {
  test("is the staff principal the render phase decided on", async () => {
    const editor = await site.factory.user.create({ role: "editor" });
    const ctx = site.actingAs(editor).context;

    const tracked = trackPrincipalReads(ctx);

    expect(adminBarViewer(tracked)).toMatchObject({
      id: editor.id,
      role: "editor",
    });
    // Personal from the decision, before any read.
    expect(renderIsPersonal(tracked)).toBe(true);
  });

  test("is null for a member, and asking does not read the principal", async () => {
    const member = await site.factory.user.create({ role: "member" });
    const ctx = site.actingAs(member).context;
    const tracked = trackPrincipalReads(ctx);

    expect(adminBarViewer(tracked)).toBeNull();
    expect(renderIsPersonal(tracked)).toBe(false);
  });

  test("follows an admin on a render no render phase began for", async () => {
    const admin = await site.factory.user.create({ role: "admin" });

    const viewer = adminBarViewer(site.actingAs(admin).context);

    expect(viewer).toMatchObject({ id: admin.id, role: "admin" });
  });

  test("is null for a member on a render no render phase began for", async () => {
    const member = await site.factory.user.create({ role: "member" });

    expect(adminBarViewer(site.actingAs(member).context)).toBeNull();
  });

  test("is null for a visitor on a render no render phase began for", () => {
    expect(adminBarViewer(site.context)).toBeNull();
  });

  test("is null for a viewer whose role lacks admin:access", async () => {
    const editor = await grantedToNoOne.factory.user.create({ role: "editor" });

    const ctx = grantedToNoOne.actingAs(editor).context;

    expect(adminBarViewer(trackPrincipalReads(ctx))).toBeNull();
  });

  test("is a viewer whose role holds admin:access", async () => {
    const member = await grantedToMembers.factory.user.create({
      role: "member",
    });

    const ctx = grantedToMembers.actingAs(member).context;

    expect(adminBarViewer(trackPrincipalReads(ctx))).toMatchObject({
      id: member.id,
      role: "member",
    });
  });
});
