import { Factory } from "fishery";
import * as v from "valibot";
import { describe, expect, expectTypeOf, test } from "vitest";

import type { Db } from "../context/app-context.js";
import type { NewSetting, Setting } from "../db/schema/settings.js";
import type { PluginDescriptor } from "../plugin/define.js";
import { now } from "../clock.js";
import { settings } from "../db/schema/settings.js";
import { sendMailTest } from "../mail/mail-test.js";
import { definePlugin } from "../plugin/define.js";
import { base } from "../rpc/base.js";
import { testSite } from "./site.js";

const posts = definePlugin("posts", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
  },
});

const site = await testSite({ plugins: [posts] });

describe("a test site booted with plugins", () => {
  test("renders a published entry created with no author given", async () => {
    const post = await site.factory.published.create({ title: "Hello" });

    const page = await site.visit(post);

    page.assertOk().assertTemplate("fallback").assertSee("Hello");
  });
});

let boots = 0;
const counted = definePlugin("counted", {
  setup: () => {
    boots += 1;
  },
});
const resetting = await testSite({ plugins: [posts, counted] });

describe("before each test", () => {
  test.each(["the first test", "the second test"])(
    "%s sees an empty database whose ids restart at 1",
    async () => {
      expect(await resetting.context.db.query.entries.findMany()).toEqual([]);
      expect(await resetting.context.db.query.users.findMany()).toEqual([]);

      const post = await resetting.factory.published.create();

      expect([post.authorId, post.id]).toEqual([1, 1]);
      expect(boots).toBe(1);
    },
  );
});

/** Shaped as a plugin's factory is: bound to the site's db through `transient`. */
const optionFactory = Factory.define<
  NewSetting,
  { db: Db },
  Setting,
  Partial<NewSetting>
>(({ sequence, transientParams, onCreate }) => {
  onCreate(async (attrs) => {
    const { db } = transientParams;
    if (!db) throw new Error("optionFactory: no db");
    const [row] = await db.insert(settings).values(attrs).returning();
    if (!row) throw new Error("optionFactory: insert returned no row");
    return row;
  });
  return { group: "plugin", key: `option-${String(sequence)}`, value: "" };
});

const withFactories = await testSite({ factories: { option: optionFactory } });

describe("a plugin's factories", () => {
  test("join site.factory, typed and bound to the site's database", async () => {
    expectTypeOf(withFactories.factory.option).toEqualTypeOf<
      typeof optionFactory
    >();

    const option = await withFactories.factory.option.create({ value: "on" });

    expect(
      await withFactories.context.db.query.settings.findFirst(),
    ).toMatchObject({ key: option.key, value: "on" });
  });
});

const mailing = await testSite({});

describe("the site's mail", () => {
  test("records what a test sent", async () => {
    await sendMailTest(mailing.context, {
      to: "a@example.test",
      origin: "local",
    });

    mailing.mail.assertSent("mailTest", { to: "a@example.test" });
  });

  test("starts the next test with nothing sent", () => {
    mailing.mail.assertNothingSent();
  });
});

const greeter = definePlugin("greeter", {
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/greeting",
      auth: "public",
      handler: (_request, appCtx) =>
        new Response(String((appCtx.env as { GREETING?: string }).GREETING)),
    });
  },
});
const withEnv = await testSite({
  plugins: [greeter],
  env: { GREETING: "Hello from a binding" },
});

describe("the site's env", () => {
  test("hands the site's code the bindings a test fakes", async () => {
    (await withEnv.visit("/_plumix/greeter/greeting")).assertSee(
      "Hello from a binding",
    );
  });
});

describe("the site's cdn", () => {
  test("is the fake, though the config names none", async () => {
    const post = await site.factory.published.create();

    (await site.visit(post)).assertHeader("cache-tag");
  });
});

const deferring = await testSite({});

describe("work a test defers", () => {
  test("settles before the next test's data is reset", () => {
    const { db, defer } = deferring.context;
    defer(
      new Promise<void>((resolve) => setTimeout(resolve, 20)).then(() =>
        db.insert(settings).values({ group: "late", key: "late", value: "" }),
      ),
    );
  });

  test("leaves nothing behind in the next test", async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(await deferring.context.db.query.settings.findMany()).toEqual([]);
  });
});

const calling = await testSite({ plugins: [posts] });

describe("the site's rpc", () => {
  test("calls a core procedure as a visitor when no one is signed in", async () => {
    const session = await calling.rpc.auth.session();

    expect(session).toEqual({ user: null, needsBootstrap: true });
  });
});

describe("acting as a role", () => {
  test("calls as a fresh user of that role", async () => {
    const session = await calling.actingAs("editor").rpc.auth.session();

    expect(session.user).toMatchObject({ id: 1, role: "editor" });
  });
});

describe("a site bound to a role and kept across tests", () => {
  const editor = calling.actingAs("editor");

  test("signs in as a user created in the first test", async () => {
    const session = await editor.rpc.auth.session();

    expect(session.user).toMatchObject({ id: 1, role: "editor" });
  });

  test("signs in as a user created again in the next test", async () => {
    const session = await editor.rpc.auth.session();

    expect(session.user).toMatchObject({ id: 1, role: "editor" });
  });

  test("calls as one user for as long as a test lasts", async () => {
    const first = await editor.rpc.auth.session();
    const second = await editor.rpc.auth.session();

    expect(second.user?.id).toBe(first.user?.id);
  });
});

describe("a role without the capability", () => {
  test("is refused, as it is over the wire", async () => {
    const creating = calling.actingAs("subscriber").rpc.entry.create({
      type: "post",
      title: "Hello",
      slug: "hello",
    });

    await expect(creating).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      data: { capability: "entry:post:create" },
    });
  });
});

describe("acting as a user", () => {
  test("calls as that user", async () => {
    await calling.factory.user.create({ role: "admin" });
    const author = await calling.factory.user.create({ role: "author" });

    const session = await calling.actingAs(author).rpc.auth.session();

    expect(session.user).toMatchObject({ id: 2, role: "author" });
  });

  test("sees what an earlier principal wrote", async () => {
    const author = await calling.factory.user.create({ role: "author" });
    const draft = await calling
      .actingAs(author)
      .rpc.entry.create({ type: "post", title: "Hello", slug: "hello" });

    const read = await calling
      .actingAs("editor")
      .rpc.entry.get({ id: draft.id });

    expect(read).toMatchObject({ title: "Hello", authorId: 1 });
  });
});

const greetingRouter = {
  greet: base
    .input(v.object({ name: v.string() }))
    .handler(({ input }) => `Hello, ${input.name}`),
};

function greeting(): PluginDescriptor<
  undefined,
  { readonly greeting: typeof greetingRouter }
> {
  return definePlugin("greeting", {
    setup: (ctx) => {
      ctx.registerRpcRouter(greetingRouter);
    },
  });
}

const greeted = await testSite({ plugins: [posts, greeting()] });

describe("an installed plugin's procedures", () => {
  test("are called through the site's rpc", async () => {
    const greetingText = await greeted.rpc.greeting.greet({ name: "Ann" });

    expect(greetingText).toBe("Hello, Ann");
  });

  test("are on the rpc of a site that installs the plugin, and only there", () => {
    expectTypeOf(greeted.rpc.greeting.greet)
      .parameter(0)
      .toEqualTypeOf<{ name: string }>();
    expectTypeOf(calling.rpc).not.toHaveProperty("greeting");
  });
});

const whoami = definePlugin("whoami", {
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/me",
      auth: "authenticated",
      handler: (_request, appCtx) => new Response(appCtx.user?.email),
    });
  },
});
const visiting = await testSite({ plugins: [whoami] });

describe("visiting as a user", () => {
  test("requests the page signed in as that user", async () => {
    const ann = await visiting.factory.user.create({
      email: "ann@example.test",
    });

    const page = await visiting.actingAs(ann).visit("/_plumix/whoami/me");

    page.assertOk().assertSee("ann@example.test");
  });
});

describe("a bound site's context", () => {
  test("carries the user it acts as", async () => {
    const ann = await calling.factory.user.create({ role: "editor" });

    const { user } = calling.actingAs(ann).context;

    expect(user).toMatchObject({ id: 1, role: "editor" });
  });

  test("carries a role's user once its first call created it", async () => {
    const editor = calling.actingAs("editor");
    await editor.rpc.auth.session();

    const { user } = editor.context;

    expect(user).toMatchObject({ id: 1, role: "editor" });
  });

  test("fails before a role's user exists, naming how to get one", () => {
    const editor = calling.actingAs("editor");

    expect(() => editor.context).toThrow(
      'context: the "editor" user is created by this site\'s first rpc or visit call. Make one first, or pass a user to actingAs.',
    );
  });
});

const travelling = await testSite({ plugins: [posts] });
const staying = await testSite({ plugins: [posts] });

describe("the site's clock", () => {
  test("moves for its own site only, while real time stays put", async () => {
    const realBefore = Date.now();
    const traveller = travelling.actingAs("editor");
    const stayer = staying.actingAs("editor");
    await Promise.all([
      traveller.rpc.auth.session(),
      stayer.rpc.auth.session(),
    ]);

    travelling.travel({ days: 31 });
    const [travelled, stayed] = await Promise.all([
      traveller.rpc.auth.session(),
      stayer.rpc.auth.session(),
    ]);

    expect(travelled.user).toBeNull();
    expect(stayed.user).toMatchObject({ role: "editor" });
    expect(now().getTime() - realBefore).toBeLessThan(60_000);
  });

  test("signs in a principal who first appears after the site travelled", async () => {
    travelling.travel({ days: 31 });

    const editor = travelling.actingAs("editor");

    expect((await editor.rpc.auth.session()).user).not.toBeNull();
  });

  test("freezes for its own site only", async () => {
    const editor = travelling.actingAs("editor");
    await editor.rpc.auth.session();

    travelling.freezeTime("2100-01-01T00:00:00Z");

    const stayer = staying.actingAs("editor");

    expect((await editor.rpc.auth.session()).user).toBeNull();
    expect((await stayer.rpc.auth.session()).user).not.toBeNull();
    expect(now().getTime()).toBeLessThan(Date.parse("2100-01-01T00:00:00Z"));
  });

  test.each(["the first test", "the second test"])(
    "%s starts on real time, whatever an earlier test moved",
    async () => {
      const editor = travelling.actingAs("editor");

      expect((await editor.rpc.auth.session()).user).not.toBeNull();

      travelling.travel({ days: 31 });
    },
  );
});
