import { describe, expect, test } from "vitest";

import type {
  AppContext,
  AuthenticatedUser,
  Db,
} from "../../context/app-context.js";
import type { PluginRegistry } from "../../plugin/manifest.js";
import { block } from "../../hooks/block-render.js";
import { HookRegistry } from "../../hooks/registry.js";
import { definePlugin } from "../../plugin/define.js";
import { installPlugins } from "../../runtime/install-plugins.js";
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

function contextFor(
  user: AuthenticatedUser | null,
  plugins?: PluginRegistry,
): AppContext {
  return createTestContext({ db: {} as Db, user, plugins });
}

async function adminAccessFrom(
  minRole: AuthenticatedUser["role"],
): Promise<PluginRegistry> {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins: [
      definePlugin("admin-access", {
        setup: (ctx) => {
          ctx.registerCapability("admin:access", minRole);
        },
      }),
    ],
  });
  return registry;
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
    ["reading ctx.apiToken", (ctx) => ctx.apiToken],
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

  test("a handler a render fires gets the tracked context, so its read of the principal marks the render personal", async () => {
    const hooks = new HookRegistry();
    await installPlugins({
      hooks,
      plugins: [
        definePlugin("reads-user", {
          setup: (ctx) => {
            ctx.filters.add(
              block.beforeRender,
              (element, _input, handlerCtx) => {
                void handlerCtx.user;
                return element;
              },
            );
          },
        }),
      ],
    });
    const ctx = createTestContext({ db: {} as Db, user: subscriber, hooks });
    const tracked = trackPrincipalReads(ctx);
    expect(renderIsPersonal(ctx)).toBe(false);

    void tracked.filters.apply(block.beforeRender, null, {
      node: { id: "n", name: "paragraph" },
      context: {} as never,
    });

    expect(renderIsPersonal(ctx)).toBe(true);
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

  test("is null for a viewer whose role lacks admin:access, whatever its rank", async () => {
    const editor: AuthenticatedUser = { ...subscriber, role: "editor" };

    const ctx = contextFor(editor, await adminAccessFrom("admin"));

    expect(adminBarViewer(trackPrincipalReads(ctx))).toBeNull();
  });

  test("is a viewer whose role holds admin:access, whatever its rank", async () => {
    const ctx = contextFor(subscriber, await adminAccessFrom("subscriber"));

    expect(adminBarViewer(trackPrincipalReads(ctx))).toBe(subscriber);
  });
});
