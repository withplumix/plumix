import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app-context.js";
import type { MailOverrides } from "./contract/registry.js";
import { definePlugin } from "../plugin/define.js";
import { defaultTestTheme } from "../test/default-theme.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { makeMailer } from "../test/mailer.js";
import { defineTheme } from "../theme.js";
import { defineMail } from "./contract/define.js";
import { MailerNotConfigured, MailError } from "./contract/errors.js";

declare module "./contract/registry.js" {
  interface MailRegistry {
    welcome: { readonly name: string };
    greeting: { readonly name: string };
  }
}

const welcomeMail = defineMail("welcome", {
  subject: (props, ctx) => `Welcome to ${ctx.siteName}, ${props.name}`,
  text: (props, ctx) => `Hello ${props.name}, visit ${ctx.baseUrl}`,
  html: (props) => `<p>Hello ${props.name}</p>`,
  preview: { name: "Ann" },
});

/** A plugin that declares `welcome` and sends it from a route. */
const welcomer = definePlugin("welcomer", {
  mails: [welcomeMail],
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/send",
      auth: "public",
      handler: async (request, appCtx) => {
        const to = new URL(request.url).searchParams.get("to") ?? "";
        await appCtx.mail.send("welcome", { name: "Ann" }, { to });
        return new Response(null, { status: 204 });
      },
    });
  },
});

describe("ctx.mail.send", () => {
  test("renders a plugin-declared mail and hands it to the mailer", async () => {
    const mailer = makeMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Test Site" } },
        plugins: [welcomer],
      },
    });

    const response = await h.fetch(
      "/_plumix/welcomer/send?to=ann@example.test",
    );

    response.assertStatus(204);
    expect(mailer.sent).toEqual([
      {
        to: "ann@example.test",
        subject: "Welcome to Test Site, Ann",
        text: "Hello Ann, visit https://cms.example/",
        html: "<p>Hello Ann</p>",
      },
    ]);
  });
});

const GREETING = { id: "test.greeting", message: "Hello {name}" };

/** Sends a localized `greeting` to `?to=`, whoever that is. */
const greeter = definePlugin("greeter", {
  mails: [
    defineMail("greeting", {
      subject: (props, ctx) => ctx.t(GREETING, { name: props.name }),
      text: (props, ctx) => `${ctx.locale}: ${props.name}`,
      preview: { name: "Ann" },
    }),
  ],
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/send",
      auth: "public",
      handler: async (request, appCtx) => {
        const to = new URL(request.url).searchParams.get("to") ?? "";
        await appCtx.mail.send("greeting", { name: "Ann" }, { to });
        return new Response(null, { status: 204 });
      },
    });
  },
});

async function greeterHarness(mailer: ReturnType<typeof makeMailer>) {
  return createDispatcherHarness({
    config: {
      mailer,
      plugins: [greeter],
      i18n: { defaultLocale: "en", locales: ["en", "de"] },
    },
    pluginCatalogs: {
      de: [
        () =>
          Promise.resolve({
            messages: { "test.greeting": ["Hallo ", ["name"]] },
          }),
      ],
    },
  });
}

describe("a site with no mailer", () => {
  test("throws MailerNotConfigured from send", async () => {
    const caught: unknown[] = [];
    const sender = definePlugin("sender", {
      mails: [welcomeMail],
      setup: (ctx) => {
        ctx.registerRoute({
          method: "GET",
          path: "/send",
          auth: "public",
          handler: async (_request, appCtx) => {
            await appCtx.mail
              .send("welcome", { name: "Ann" }, { to: "ann@example.test" })
              .catch((error: unknown) => caught.push(error));
            return new Response(null, { status: 204 });
          },
        });
      },
    });
    const h = await createDispatcherHarness({
      config: { plugins: [sender] },
    });

    await h.fetch("/_plumix/sender/send");

    expect(caught).toHaveLength(1);
    expect(caught[0]).toBeInstanceOf(MailerNotConfigured);
  });
});

describe("the locale a mail renders in", () => {
  test("is the recipient's own when the address belongs to a user", async () => {
    const mailer = makeMailer();
    const h = await greeterHarness(mailer);
    await h.factory.user.create({
      email: "klaus@example.test",
      meta: { locale: "de" },
    });

    await h.fetch("/_plumix/greeter/send?to=klaus@example.test");

    expect(mailer.sent[0]).toMatchObject({
      subject: "Hallo Ann",
      text: "de: Ann",
    });
  });

  test("is the request's for an address no user has", async () => {
    const mailer = makeMailer();
    const h = await greeterHarness(mailer);

    await h.fetch("/_plumix/greeter/send?to=new@example.test&lang=de");

    expect(mailer.sent[0]).toMatchObject({ subject: "Hallo Ann" });
  });

  test("wins over the request's", async () => {
    const mailer = makeMailer();
    const h = await greeterHarness(mailer);
    await h.factory.user.create({
      email: "ann@example.test",
      meta: { locale: "en" },
    });

    await h.fetch("/_plumix/greeter/send?to=ann@example.test&lang=de");

    expect(mailer.sent[0]).toMatchObject({
      subject: "Hello Ann",
      text: "en: Ann",
    });
  });

  test("is the site default when neither the recipient nor the request has one", async () => {
    const mailer = makeMailer();
    const h = await greeterHarness(mailer);

    await h.fetch("/_plumix/greeter/send?to=new@example.test");

    expect(mailer.sent[0]).toMatchObject({
      subject: "Hello Ann",
      text: "en: Ann",
    });
  });
});

describe("overriding a mail", () => {
  test("takes each render function from the site, then the theme, then the owner", async () => {
    const mailer = makeMailer();
    const h = await createDispatcherHarness({
      config: {
        mailer,
        auth: { magicLink: { siteName: "Test Site" } },
        theme: defineTheme({
          ...defaultTestTheme,
          mail: {
            magicLink: {
              subject: () => "Theme subject",
              text: (props) => `Theme text ${props.url}`,
            },
          },
        }),
        mail: {
          overrides: {
            magicLink: { subject: (_props, ctx) => `Site ${ctx.siteName}` },
          },
        },
      },
    });
    await h.factory.user.create({ email: "ann@example.test" });

    await h.fetch("/_plumix/auth/magic-link/request", {
      method: "POST",
      json: { email: "ann@example.test" },
    });

    expect(mailer.sent[0]?.subject).toBe("Site Test Site");
    expect(mailer.sent[0]?.text).toMatch(
      /^Theme text https:\/\/cms\.example\//,
    );
    // Neither overrides the HTML, so core's own renders it.
    expect(mailer.sent[0]?.html).toContain("The link expires in 15 minutes.");
  });
});

describe("ctx.mail.send — a name nobody declared", () => {
  test("throws a MailError naming the mail and sends nothing", async () => {
    const mailer = makeMailer();
    let outcome: PromiseSettledResult<void> | undefined;
    // `welcome` is typed by this file, but this plugin never declares it.
    const stray = definePlugin("stray", {
      setup: (ctx) => {
        ctx.registerRoute({
          method: "GET",
          path: "/send",
          auth: "public",
          handler: async (_request, appCtx) => {
            [outcome] = await Promise.allSettled([
              appCtx.mail.send(
                "welcome",
                { name: "Ann" },
                { to: "ann@example.test" },
              ),
            ]);
            return new Response(null, { status: 204 });
          },
        });
      },
    });
    const h = await createDispatcherHarness({
      config: { mailer, plugins: [stray] },
    });

    await h.fetch("/_plumix/stray/send");

    expect(outcome?.status).toBe("rejected");
    const reason: unknown =
      outcome?.status === "rejected" ? outcome.reason : undefined;
    expect(reason).toBeInstanceOf(MailError);
    expect(reason).toMatchObject({
      code: "mail_not_declared",
      mail: "welcome",
    });
    expect(mailer.sent).toEqual([]);
  });
});

describe("ctx.mail.send types", () => {
  test("refuses an undeclared name and the wrong props at compile time", () => {
    // Checked by the compiler, never run.
    const unsent = (ctx: AppContext) => [
      // @ts-expect-error - no mail is declared as "welcom".
      ctx.mail.send("welcom", { name: "Ann" }, { to: "a@example.test" }),
      // @ts-expect-error - `welcome` takes `{ name }`, not `{ nam }`.
      ctx.mail.send("welcome", { nam: "Ann" }, { to: "a@example.test" }),
    ];
    void unsent;
  });

  test("defineMail takes its props explicitly, before any registry entry", () => {
    // `notYetRegistered` has no MailRegistry entry; the props are the type
    // argument, and the render functions and preview are checked against it.
    const digest = defineMail<{ readonly count: number }>("notYetRegistered", {
      subject: (props) => `${String(props.count)} new`,
      text: (props) => String(props.count),
      // @ts-expect-error - `count` is a number.
      preview: { count: "three" },
    });
    expect(digest.name).toBe("notYetRegistered");
  });

  test("types an override against its mail's props", () => {
    // Checked by the compiler, never run.
    const overrides: MailOverrides = {
      welcome: {
        subject: (props) => props.name,
        // @ts-expect-error - `welcome` takes `{ name }`, not `{ nam }`.
        text: (props: { readonly nam: string }) => props.nam,
      },
    };
    void overrides;
  });
});
