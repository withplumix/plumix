import { beforeAll, describe, expect, test } from "vitest";

import type { CdnFake } from "../test/cdn-fake.js";
import { HookRegistry } from "../hooks/registry.js";
import { definePlugin } from "../plugin/define.js";
import { group, number, text } from "../plugin/fields/index.js";
import { entry, fallback } from "../route/render/template-builders.js";
import { installPlugins } from "../runtime/install-plugins.js";
import { defineTemplate } from "../template.js";
import { fakeCdn } from "../test/cdn-fake.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { createRpcHarness } from "../test/rpc.js";
import { defineTheme } from "../theme.js";
import { SettingsWriteError } from "./errors.js";

// The RPC handler's graph loads on the first RPC, ~800ms cold; loading it here
// keeps that out of a test, where a busy runner hit the 5s timeout.
beforeAll(async () => {
  await import("../rpc/build-handler.js");
});

/** Who heard each `settings:group_changed`, and what it said. */
interface Heard {
  readonly group: string;
  readonly set: unknown;
  readonly removed: readonly string[];
  readonly userId: number | null;
}

function writer(heard: Heard[]) {
  return definePlugin("writer", (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.addAction("settings:group_changed", (changes, appCtx) => {
      heard.push({ ...changes, userId: appCtx.user?.id ?? null });
    });
    ctx.registerRoute({
      method: "POST",
      path: "/write",
      auth: "authenticated",
      handler: async (request, appCtx) => {
        const group = new URL(request.url).searchParams.get("group");
        const values = (await request.json()) as Record<string, unknown>;
        return Response.json(
          await appCtx.settings.write(group ?? "site_info", values),
        );
      },
    });
  });
}

const theme = defineTheme({
  templates: [
    fallback(() => null),
    entry(
      defineTemplate({
        settings: ["site_info", "writer_internal"],
        render: (args) => {
          const title = args.settings?.site_info?.title;
          const motto = args.settings?.writer_internal?.motto;
          return (
            <h1>
              {typeof title === "string" ? title : "Untitled"}
              {typeof motto === "string" ? motto : ""}
            </h1>
          );
        },
      }),
    ),
  ],
});

const PAGE = "/post/hello";

async function site() {
  const heard: Heard[] = [];
  const cdn: CdnFake = fakeCdn();
  const h = await createDispatcherHarness({
    cdn,
    config: { plugins: [writer(heard)], theme },
  });
  const admin = await h.seedUser("admin");
  await h.factory.entry.create({
    type: "post",
    slug: "hello",
    title: "Hello",
    status: "published",
    authorId: admin.id,
    publishedAt: new Date(),
  });
  const write = async (
    values: Record<string, unknown>,
    group = "site_info",
  ) => {
    const response = await h.fetch(`/_plumix/writer/write?group=${group}`, {
      method: "POST",
      json: values,
      as: admin,
    });
    await h.drainDeferred();
    return response;
  };
  return { h, cdn, heard, admin, write };
}

describe("ctx.settings.write", () => {
  test("a page that printed the group is not stored after a plugin writes it", async () => {
    const s = await site();
    (await s.h.fetch(PAGE)).assertStatus(200);
    await s.h.drainDeferred();
    s.cdn.assertStored(PAGE);

    (await s.write({ title: "Written" })).assertStatus(200);

    s.cdn.assertNotStored(PAGE);
    expect(await (await s.h.fetch(PAGE)).text()).toContain("Written");
  });

  test("announces what it changed to subscribers, as the writing user", async () => {
    const s = await site();

    await s.write({ title: "Written", tagline: null });

    expect(s.heard).toEqual([
      {
        group: "site_info",
        set: { title: "Written" },
        removed: ["tagline"],
        userId: s.admin.id,
      },
    ]);
  });

  // A private group holds server-side secrets, so its values reach no
  // subscriber; a page that printed it is still purged.
  test("a private group's write is announced to no one, and still purges", async () => {
    const s = await site();
    (await s.h.fetch(PAGE)).assertStatus(200);
    await s.h.drainDeferred();
    s.cdn.assertStored(PAGE);

    (await s.write({ motto: "Secret" }, "writer_internal")).assertStatus(200);

    expect(s.heard).toEqual([]);
    s.cdn.assertNotStored(PAGE);
    expect(await (await s.h.fetch(PAGE)).text()).toContain("Secret");
  });

  // A plugin's write is not made from a copy, so it moves the token unchecked
  // and an editor's older copy conflicts instead of overwriting it.
  test("refuses an editor's save from a copy read before the write", async () => {
    const s = await site();
    const first = await s.h.fetch("/_plumix/rpc/settings/upsert", {
      method: "POST",
      json: {
        json: { group: "site_info", values: { title: "A" }, ifMatch: "0" },
      },
      as: s.admin,
    });
    first.assertStatus(200);
    const { json: copy } = await first.json<{ json: { etag: string } }>();

    await s.write({ title: "Written" });

    const stale = await s.h.fetch("/_plumix/rpc/settings/upsert", {
      method: "POST",
      json: {
        json: {
          group: "site_info",
          values: { title: "B" },
          ifMatch: copy.etag,
        },
      },
      as: s.admin,
    });
    stale.assertStatus(409);
  });
});

describe("ctx.settings.write, called from a plugin's own code", () => {
  async function harness() {
    const hooks = new HookRegistry();
    const plugin = definePlugin("test", (ctx) => {
      ctx.registerSettingsGroup("blog", {
        label: "Blog",
        fields: [
          text("tagline").default("Hello"),
          number("perPage").default(10),
        ],
      });
      ctx.registerSettingsGroup("profile", {
        label: "Profile",
        fields: [
          text("name").required(),
          group("address").fields([text("city").maxLength(3)]),
        ],
      });
    });
    const { registry } = await installPlugins({ hooks, plugins: [plugin] });
    const h = await createRpcHarness({
      authAs: "admin",
      plugins: registry,
      hooks,
    });
    const save = async (group: string, values: Record<string, unknown>) => {
      const { etag } = await h.client.settings.get({ group });
      return h.client.settings.upsert({ group, values, ifMatch: etag });
    };
    return { h, save };
  }

  // A write that changes nothing is no write, so an open copy stays current.
  test("leaves an editor's copy current when it changes nothing", async () => {
    const { h, save } = await harness();
    const { etag } = await save("notes", { body: "A" });

    await h.context.settings.write("notes", {});

    await expect(
      h.client.settings.upsert({
        group: "notes",
        values: { body: "B" },
        ifMatch: etag,
      }),
    ).resolves.toMatchObject({ values: { body: "B" } });
  });

  test("stores a value of exactly 64 KiB", async () => {
    const { h } = await harness();
    // Two quotes around 65,534 characters encode to 65,536 bytes.
    const body = "a".repeat(65_534);

    const copy = await h.context.settings.write("notes", { body });

    expect(copy.values).toEqual({ body });
  });

  test("refuses a value past 64 KiB, naming its key", async () => {
    const { h } = await harness();
    const body = "a".repeat(65_535);

    const refused = await h.context.settings
      .write("notes", { title: "kept out too", body })
      .catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(SettingsWriteError);
    expect((refused as SettingsWriteError).data).toEqual({
      reason: "settings_value_too_large",
      key: "notes.body",
    });
    expect((await h.client.settings.get({ group: "notes" })).values).toEqual(
      {},
    );
  });

  // Starting values fill a group only until its first save.
  test("a setting cleared after the first save stays cleared by later writes", async () => {
    const { h, save } = await harness();
    await save("blog", {});
    await save("blog", { perPage: null });

    const copy = await h.context.settings.write("blog", { tagline: "Mine" });

    expect(copy.values).toEqual({ tagline: "Mine" });
  });

  test("a key mapped to undefined is removed, as null is", async () => {
    const { h } = await harness();
    await h.context.settings.write("notes", { title: "A", body: "B" });

    const copy = await h.context.settings.write("notes", { title: undefined });

    expect(copy.values).toEqual({ body: "B" });
  });

  // The error names the top-level key, however deep the field that failed.
  test("refuses an invalid value, naming the key it sits under", async () => {
    const { h } = await harness();

    const flat = await h.context.settings
      .write("profile", { name: null })
      .catch((error: unknown) => error);
    const nested = await h.context.settings
      .write("profile", { name: "N", address: { city: "Lisbon" } })
      .catch((error: unknown) => error);

    expect(flat).toBeInstanceOf(SettingsWriteError);
    expect((flat as SettingsWriteError).data).toMatchObject({
      reason: "settings_invalid_value",
      key: "profile.name",
    });
    expect(nested).toBeInstanceOf(SettingsWriteError);
    expect((nested as SettingsWriteError).data).toMatchObject({
      reason: "settings_invalid_value",
      key: "profile.address",
    });
  });

  // Like any system write, a key stored or removed moves the token of a saved
  // group, so an open copy conflicts instead of overwriting it.
  test("writeIfAbsent refuses an editor's copy read before it stored a key", async () => {
    const { h, save } = await harness();
    const { etag } = await save("notes", { title: "First" });

    await h.context.settings.writeIfAbsent("notes", { body: "B" });

    await expect(
      h.client.settings.upsert({
        group: "notes",
        values: { title: "Mine" },
        ifMatch: etag,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("removeValue refuses an editor's copy read before it removed a key", async () => {
    const { h, save } = await harness();
    const { etag } = await save("places", { header: "main" });

    await h.context.settings.removeValue("places", "main");

    await expect(
      h.client.settings.upsert({
        group: "places",
        values: { footer: "x" },
        ifMatch: etag,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  // Two first writers racing converge: the later one stores nothing and
  // answers what the earlier one stored.
  test("writeIfAbsent stores only the keys the group lacks", async () => {
    const { h } = await harness();
    await h.context.settings.write("notes", { title: "First" });
    const spy = h.spyAction("settings:group_changed");

    const copy = await h.context.settings.writeIfAbsent("notes", {
      title: "Second",
      body: "B",
    });

    expect(copy.values).toEqual({ title: "First", body: "B" });
    const [changes] = spy.lastArgs ?? [];
    expect(changes).toEqual({
      group: "notes",
      set: { body: "B" },
      removed: [],
    });
  });

  test("writeIfAbsent changes nothing when every key is stored", async () => {
    const { h, save } = await harness();
    const { etag } = await save("notes", { title: "First" });
    const spy = h.spyAction("settings:group_changed");

    const copy = await h.context.settings.writeIfAbsent("notes", {
      title: "Second",
    });

    expect(copy).toEqual({ etag, values: { title: "First" } });
    spy.assertNotCalled();
  });

  // Unbinding everything that names a deleted thing: one statement, so a key
  // bound meanwhile is not missed and a key bound elsewhere is not touched.
  test("removeValue removes every key holding the value, and only those", async () => {
    const { h } = await harness();
    await h.context.settings.write("places", {
      header: "main",
      footer: "main",
      sidebar: "other",
    });
    const spy = h.spyAction("settings:group_changed");

    const copy = await h.context.settings.removeValue("places", "main");

    expect(copy.values).toEqual({ sidebar: "other" });
    const [changes] = spy.lastArgs ?? [];
    expect(changes).toEqual({
      group: "places",
      set: {},
      removed: ["header", "footer"],
    });
  });

  test("removeValue announces nothing when no key holds the value", async () => {
    const { h, save } = await harness();
    const { etag } = await save("places", { sidebar: "other" });
    const spy = h.spyAction("settings:group_changed");

    const copy = await h.context.settings.removeValue("places", "main");

    expect(copy).toEqual({ etag, values: { sidebar: "other" } });
    spy.assertNotCalled();
  });
});
