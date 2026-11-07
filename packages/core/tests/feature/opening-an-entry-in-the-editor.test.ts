import { describe, test } from "vitest";

import type { RequestAuthenticator } from "../../src/auth/authenticator.js";
import type { User } from "../../src/db/schema/users.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

// Exercises the edit gate end-to-end through the real public render path:
// resolveSingle → resolveEditMode → PlumixProvider mode → injectEditorBootstrap.
// The `data-plumix-editor` marker is the injected runtime script.

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [blogPlugin] });

describe("edit gate through the public render", () => {
  test("a visitor render ships no editor runtime", async () => {
    await site.factory.published.create({ type: "post", slug: "hello" });

    const page = await site.visit("/post/hello");

    page.assertOk().assertDontSee("data-plumix-editor");
  });

  test("an authorized editor with ?plumix.edit gets the editor runtime injected", async () => {
    const editor = await site.factory.user.create({ role: "editor" });
    await site.factory.published.create({
      type: "post",
      slug: "hello",
      authorId: editor.id,
    });

    const page = await site.actingAs(editor).visit("/post/hello?plumix.edit");

    page.assertOk().assertSee("data-plumix-editor");
  });

  test("an authorized editor without ?plumix.edit stays a normal render", async () => {
    const editor = await site.factory.user.create({ role: "editor" });
    await site.factory.published.create({
      type: "post",
      slug: "hello",
      authorId: editor.id,
    });

    const page = await site.actingAs(editor).visit("/post/hello");

    page.assertDontSee("data-plumix-editor");
  });

  test("?plumix.edit without a session never injects the runtime (leaked-URL guard)", async () => {
    await site.factory.published.create({ type: "post", slug: "hello" });

    const page = await site.visit("/post/hello?plumix.edit");

    page.assertDontSee("data-plumix-editor");
  });

  test("edit render stamps data-plumix-mode=edit on <html> (island hydration gate)", async () => {
    const editor = await site.factory.user.create({ role: "editor" });
    await site.factory.published.create({
      type: "post",
      slug: "hello",
      authorId: editor.id,
    });

    const page = await site.actingAs(editor).visit("/post/hello?plumix.edit");

    page.assertSee('<html lang="en" dir="ltr" data-plumix-mode="edit">');
  });

  test("a visitor render does not stamp data-plumix-mode", async () => {
    await site.factory.published.create({ type: "post", slug: "hello" });

    const page = await site.visit("/post/hello");

    page.assertDontSee("data-plumix-mode");
  });
});

/**
 * The default-cookie cases above miss a custom authenticator whose session
 * rides another signal; skipping it on the public render left editors a
 * canvas without a runtime.
 */
const CUSTOM_COOKIE = "x_custom_session";
const hasCustomCookie = (request: Request): boolean =>
  (request.headers.get("cookie") ?? "").includes(`${CUSTOM_COOKIE}=`);

/** Resolves the editor a test signs in from a non-standard cookie. */
const signedIn: { user: User | null } = { user: null };
const authenticate: RequestAuthenticator["authenticate"] = (request) =>
  Promise.resolve(
    hasCustomCookie(request) && signedIn.user
      ? { user: signedIn.user, credential: "session" }
      : null,
  );

const declaringSite = await testSite({
  plugins: [blogPlugin],
  config: {
    auth: { authenticator: { authenticate, hasSession: hasCustomCookie } },
  },
});
const undeclaringSite = await testSite({
  plugins: [blogPlugin],
  config: { auth: { authenticator: { authenticate } } },
});

const editHeaders = { cookie: `${CUSTOM_COOKIE}=live` };

describe("edit gate with a custom (non-cookie) authenticator", () => {
  test("declares hasSession → an authed editor gets the runtime injected", async () => {
    signedIn.user = await declaringSite.factory.user.create({ role: "editor" });
    await declaringSite.factory.published.create({
      type: "post",
      slug: "hello",
      authorId: signedIn.user.id,
    });

    const page = await declaringSite.visit("/post/hello?plumix.edit", {
      headers: editHeaders,
    });

    page.assertOk().assertSee("data-plumix-editor");
  });

  // A non-cookie guard must declare `hasSession`, or the public render falls
  // back to the standard cookie and skips auth.
  test("omits hasSession → the public render skips it, no runtime injected", async () => {
    signedIn.user = await undeclaringSite.factory.user.create({
      role: "editor",
    });
    await undeclaringSite.factory.published.create({
      type: "post",
      slug: "hello",
      authorId: signedIn.user.id,
    });

    const page = await undeclaringSite.visit("/post/hello?plumix.edit", {
      headers: editHeaders,
    });

    page.assertDontSee("data-plumix-editor");
  });
});
