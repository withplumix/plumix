import { Factory } from "fishery";
import { describe, expect, expectTypeOf, test } from "vitest";

import type { Db } from "../context/app-context.js";
import type { NewSetting, Setting } from "../db/schema/settings.js";
import { settings } from "../db/schema/settings.js";
import { sendMailTest } from "../mail/mail-test.js";
import { definePlugin } from "../plugin/define.js";
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
