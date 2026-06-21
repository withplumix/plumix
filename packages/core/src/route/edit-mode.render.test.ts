import { describe, expect, test } from "vitest";

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
