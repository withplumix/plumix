import { describe, expect, test } from "vitest";

import type { RequestAuthenticator } from "../auth/authenticator.js";
import type { User } from "../db/schema/users.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

// Exercises the edit gate end-to-end through the real public render path:
// resolveSingle → resolveEditMode → PlumixProvider mode → injectEditorBootstrap.
// The `data-plumix-editor` marker is the injected runtime script.

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", { label: "Posts", isPublic: true });
});

const URL = "https://cms.example/post/hello";

async function seed() {
  const h = await createDispatcherHarness({ plugins: [blogPlugin] });
  const editor = await h.seedUser("editor");
  await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello",
    content: null,
    status: "published",
    authorId: editor.id,
  });
  return { h, editor };
}

describe("edit gate through the public render", () => {
  test("a visitor render ships no editor runtime", async () => {
    const { h } = await seed();

    const res = await h.dispatch(new Request(URL));

    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("data-plumix-editor");
  });

  test("an authorized editor with ?plumix.edit gets the editor runtime injected", async () => {
    const { h, editor } = await seed();

    const req = await h.authenticateRequest(
      new Request(`${URL}?plumix.edit`),
      editor.id,
    );
    const res = await h.dispatch(req);

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("data-plumix-editor");
  });

  test("an authorized editor without ?plumix.edit stays a normal render", async () => {
    const { h, editor } = await seed();

    const req = await h.authenticateRequest(new Request(URL), editor.id);
    const res = await h.dispatch(req);

    expect(await res.text()).not.toContain("data-plumix-editor");
  });

  test("?plumix.edit without a session never injects the runtime (leaked-URL guard)", async () => {
    const { h } = await seed();

    const res = await h.dispatch(new Request(`${URL}?plumix.edit`));

    expect(await res.text()).not.toContain("data-plumix-editor");
  });

  test("edit render stamps data-plumix-mode=edit on <html> (island hydration gate)", async () => {
    const { h, editor } = await seed();

    const req = await h.authenticateRequest(
      new Request(`${URL}?plumix.edit`),
      editor.id,
    );
    const body = await (await h.dispatch(req)).text();

    expect(body).toMatch(/<html[^>]*data-plumix-mode="edit"/);
  });

  test("a visitor render does not stamp data-plumix-mode", async () => {
    const { h } = await seed();

    const body = await (await h.dispatch(new Request(URL))).text();

    expect(body).not.toContain("data-plumix-mode");
  });
});

// The cases above authenticate with the default session cookie, so they only
// prove the gate for `plumix_session`. The editor-dead bug shipped because a
// custom authenticator whose session rides a *different* signal — the demo's
// `plumix_demo` cookie, an IdP JWT header — was skipped on the public render,
// so an authed editor got a read-only canvas with no runtime. These pin the
// gate for that shape, at the render seam the behavior suites never cross.
describe("edit gate with a custom (non-cookie) authenticator", () => {
  const CUSTOM_COOKIE = "x_custom_session";
  const hasCustomCookie = (request: Request): boolean =>
    (request.headers.get("cookie") ?? "").includes(`${CUSTOM_COOKIE}=`);

  // A guard that resolves the seeded editor from a non-standard cookie.
  // `declaresHasSession` toggles whether it opts into public-render auth.
  async function seedWithGuard(
    declaresHasSession: boolean,
  ): Promise<Awaited<ReturnType<typeof createDispatcherHarness>>> {
    const holder: { user: User | null } = { user: null };
    const guard: RequestAuthenticator = {
      authenticate: (request) =>
        Promise.resolve(
          hasCustomCookie(request) && holder.user
            ? { user: holder.user }
            : null,
        ),
    };
    if (declaresHasSession) guard.hasSession = hasCustomCookie;

    const h = await createDispatcherHarness({
      plugins: [blogPlugin],
      authenticator: guard,
    });
    holder.user = await h.seedUser("editor");
    await h.factory.entry.create({
      type: "post",
      slug: "hello",
      title: "Hello",
      content: null,
      status: "published",
      authorId: holder.user.id,
    });
    return h;
  }

  const editRequest = (): Request =>
    new Request(`${URL}?plumix.edit`, {
      headers: { cookie: `${CUSTOM_COOKIE}=live` },
    });

  test("declares hasSession → an authed editor gets the runtime injected", async () => {
    const h = await seedWithGuard(true);

    const res = await h.dispatch(editRequest());

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("data-plumix-editor");
  });

  // The contract this fix rests on: a non-cookie guard MUST declare
  // `hasSession`. Without it the public render falls back to the standard
  // cookie (absent here), skips auth, and the editor never boots — exactly the
  // failure that shipped.
  test("omits hasSession → the public render skips it, no runtime injected", async () => {
    const h = await seedWithGuard(false);

    const res = await h.dispatch(editRequest());

    expect(await res.text()).not.toContain("data-plumix-editor");
  });
});
