import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { Logger } from "../../context/app-context.js";
import type { CaughtMail } from "../../context/dev-runtime.js";
import type { DebugSnapshot } from "../request-history/snapshot.js";
import { defineMail } from "../../mail/contract/define.js";
import { definePlugin } from "../../plugin/define.js";
import { createDispatcherHarness, DEV_ORIGIN } from "../../test/dispatcher.js";
import { poCatalogs } from "../../test/po-catalog.js";
import { DEBUG_REQUESTS_PATH } from "../request-history/path.js";

/**
 * A Vite build empties the `PLUMIX_DEV` gate and tree-shakes all of this, so
 * these tests toggle it directly.
 */
const original = process.env.PLUMIX_DEV;
beforeEach(() => {
  process.env.PLUMIX_DEV = "1";
});
afterEach(() => {
  if (original === undefined) delete process.env.PLUMIX_DEV;
  else process.env.PLUMIX_DEV = original;
});

function recordingLogger() {
  return {
    debug: vi.fn<Logger["debug"]>(),
    info: vi.fn<Logger["info"]>(),
    warn: vi.fn<Logger["warn"]>(),
    error: vi.fn<Logger["error"]>(),
  } satisfies Logger;
}

function requestMagicLink(email: string): Request {
  return new Request(`${DEV_ORIGIN}/_plumix/auth/magic-link/request`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-plumix-request": "1" },
    body: JSON.stringify({ email }),
  });
}

async function newestSnapshot(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
): Promise<{ id: string; snapshot: DebugSnapshot }> {
  const list = (await (
    await h.dispatch(new Request(`${DEV_ORIGIN}${DEBUG_REQUESTS_PATH}`))
  ).json()) as { id: string }[];
  const id = list[0]?.id ?? "";
  const snapshot = (await (
    await h.dispatch(new Request(`${DEV_ORIGIN}${DEBUG_REQUESTS_PATH}/${id}`))
  ).json()) as DebugSnapshot;
  return { id, snapshot };
}

describe("mail under plumix dev with no mailer", () => {
  test("a magic-link request is logged and recorded in the request history", async () => {
    const logger = recordingLogger();
    const h = await createDispatcherHarness({
      config: {
        mailer: undefined,
        auth: { magicLink: { siteName: "Dev Site" } },
      },
      logger,
    });
    await h.factory.user.create({ email: "ann@example.test" });

    const response = await h.dispatch(requestMagicLink("ann@example.test"));
    await h.drainDeferred();

    expect(response.status).toBe(200);
    expect(logger.info).toHaveBeenCalledWith(
      "[mailer:console]",
      expect.objectContaining({
        to: "ann@example.test",
        subject: "Sign in to Dev Site",
      }),
    );
    const { snapshot } = await newestSnapshot(h);
    const recorded = snapshot.records.mail?.map((record) => record.data);
    expect(recorded).toHaveLength(1);
    const mail = recorded?.[0] as Record<string, string> | undefined;
    expect(mail).toMatchObject({
      name: "magicLink",
      to: "ann@example.test",
      locale: "en",
      props: { ttlSeconds: 900 },
      subject: "Sign in to Dev Site",
    });
    expect(mail?.text).toContain("/_plumix/auth/magic-link/verify?token=");
    expect(mail?.html).toContain("<a href=");
  });

  test("the debug bar's Mail panel lists it, with HTML and text tabs", async () => {
    const h = await createDispatcherHarness({
      config: {
        mailer: undefined,
        auth: { magicLink: { siteName: "Dev Site" } },
      },
    });
    await h.factory.user.create({ email: "ann@example.test" });
    await h.dispatch(requestMagicLink("ann@example.test"));
    await h.drainDeferred();

    const { id } = await newestSnapshot(h);
    const html = await (
      await h.dispatch(
        new Request(`${DEV_ORIGIN}${DEBUG_REQUESTS_PATH}/${id}?format=html`),
      )
    ).text();
    const panel = paneOf(html, "mail");

    expect(panel).toContain("magicLink");
    expect(panel).toContain("ann@example.test");
    expect(panel).toContain("Sign in to Dev Site");
    expect(panel).toMatch(/<label[^>]*>HTML<\/label>/);
    expect(panel).toMatch(/<label[^>]*>Text<\/label>/);
    // The HTML body renders in an iframe with every sandbox restriction on.
    expect(panel).toMatch(
      /<iframe[^>]*sandbox=""[^>]*srcDoc="[^"]*&lt;a href=/i,
    );
    expect(panel).toContain("/_plumix/auth/magic-link/verify?token=");
  });

  test("the Mail panel says so when a request sent none", async () => {
    const h = await createDispatcherHarness({ config: { mailer: undefined } });
    await h.dispatch(new Request(`${DEV_ORIGIN}/no-such-page`));
    await h.drainDeferred();

    const { id } = await newestSnapshot(h);
    const html = await (
      await h.dispatch(
        new Request(`${DEV_ORIGIN}${DEBUG_REQUESTS_PATH}/${id}?format=html`),
      )
    ).text();

    expect(paneOf(html, "mail")).toContain("No mail sent on this request");
  });
});

/** The markup of one debug panel's pane, out of the rendered tabs. */
function paneOf(html: string, id: string): string {
  const start = html.indexOf(`data-testid="plumix-debug-panel-${id}"`);
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf('data-testid="plumix-debug-panel-', start + 1);
  return html.slice(start, end === -1 ? undefined : end);
}

const SENT_PATH = "/_plumix/debug/mail/sent";

describe("the caught-mail JSON at /_plumix/debug/mail/sent", () => {
  test("GET lists the caught mail, newest first", async () => {
    const h = await createDispatcherHarness({
      config: {
        mailer: undefined,
        auth: { magicLink: { siteName: "Dev Site" } },
      },
    });
    await h.factory.user.create({ email: "ann@example.test" });
    await h.factory.user.create({ email: "bob@example.test" });
    await h.dispatch(requestMagicLink("ann@example.test"));
    await h.dispatch(requestMagicLink("bob@example.test"));

    const listed = await h.dispatch(new Request(`${DEV_ORIGIN}${SENT_PATH}`));

    expect(listed.status).toBe(200);
    const caught = (await listed.json()) as CaughtMail[];
    expect(caught.map((mail) => mail.to)).toEqual([
      "bob@example.test",
      "ann@example.test",
    ]);
    expect(caught[0]).toMatchObject({
      name: "magicLink",
      locale: "en",
      subject: "Sign in to Dev Site",
      props: { ttlSeconds: 900 },
    });
    expect(typeof caught[0]?.id).toBe("string");
    expect(typeof caught[0]?.at).toBe("number");
    expect(caught[0]?.text).toContain("magic-link/verify?token=");
    expect(caught[0]?.html).toContain("<a href=");
  });

  test("DELETE clears the caught mail", async () => {
    const h = await createDispatcherHarness({
      config: {
        mailer: undefined,
        auth: { magicLink: { siteName: "Dev Site" } },
      },
    });
    await h.factory.user.create({ email: "ann@example.test" });
    await h.dispatch(requestMagicLink("ann@example.test"));

    const cleared = await h.dispatch(
      new Request(`${DEV_ORIGIN}${SENT_PATH}`, {
        method: "DELETE",
        headers: { "x-plumix-request": "1" },
      }),
    );

    expect(cleared.status).toBe(204);
    const after = await h.dispatch(new Request(`${DEV_ORIGIN}${SENT_PATH}`));
    expect(await after.json()).toEqual([]);
  });

  test("DELETE without the request header is refused and keeps the mail", async () => {
    const h = await createDispatcherHarness({
      config: {
        mailer: undefined,
        auth: { magicLink: { siteName: "Dev Site" } },
      },
    });
    await h.factory.user.create({ email: "ann@example.test" });
    await h.dispatch(requestMagicLink("ann@example.test"));

    const refused = await h.dispatch(
      new Request(`${DEV_ORIGIN}${SENT_PATH}`, { method: "DELETE" }),
    );

    expect(refused.status).toBe(403);
    const after = await h.dispatch(new Request(`${DEV_ORIGIN}${SENT_PATH}`));
    expect(await after.json()).toHaveLength(1);
  });

  test("a configured mailer delivers, so nothing is caught", async () => {
    // The harness's fake is the configured mailer.
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Dev Site" } } },
    });
    await h.factory.user.create({ email: "ann@example.test" });
    await h.dispatch(requestMagicLink("ann@example.test"));
    await h.drainDeferred();

    const listed = await h.dispatch(new Request(`${DEV_ORIGIN}${SENT_PATH}`));

    h.mail.assertSentCount(1);
    expect(await listed.json()).toEqual([]);
    // The request history still records what the mail rendered, and the read
    // above is not captured over it.
    const { snapshot } = await newestSnapshot(h);
    expect(snapshot.context.path).toBe("/_plumix/auth/magic-link/request");
    expect(snapshot.records.mail?.map((record) => record.data)).toEqual([
      expect.objectContaining({ name: "magicLink", to: "ann@example.test" }),
    ]);
  });

  test("does not exist outside plumix dev", async () => {
    delete process.env.PLUMIX_DEV;
    const h = await createDispatcherHarness();

    const listed = await h.dispatch(new Request(`${DEV_ORIGIN}${SENT_PATH}`));

    expect(listed.status).toBe(404);
  });
});

const GALLERY_PATH = "/_plumix/debug/mail";

declare module "../../mail/contract/registry.js" {
  interface MailRegistry {
    galleryWelcome: { readonly name: string };
  }
}

const welcomer = definePlugin("welcomer", {
  mails: [
    defineMail("galleryWelcome", {
      subject: (props) => `Welcome, ${props.name}`,
      text: (props) => `Hello ${props.name}`,
      preview: { name: "Ann" },
    }),
  ],
  setup: () => undefined,
});

async function galleryHarness() {
  return createDispatcherHarness({
    config: {
      mailer: undefined,
      auth: { magicLink: { siteName: "Dev Site" } },
      plugins: [welcomer],
      i18n: { defaultLocale: "en", locales: ["en", "de"] },
      mail: {
        overrides: {
          emailChange: { html: () => "<p>Branded by the site</p>" },
        },
      },
    },
    // Core's own catalog, which unit tests otherwise resolve to empty.
    pluginCatalogs: poCatalogs({
      de: new URL("../../../locales/mail-de.po", import.meta.url),
    }),
  });
}

async function gallery(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  query = "",
): Promise<string> {
  const response = await h.dispatch(
    new Request(`${DEV_ORIGIN}${GALLERY_PATH}${query}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  return response.text();
}

describe("the mail preview gallery at /_plumix/debug/mail", () => {
  test("lists every declared mail by owner, core first, rendered from its preview", async () => {
    const html = await gallery(await galleryHarness());

    const core = html.indexOf('data-owner="core"');
    const plugin = html.indexOf('data-owner="welcomer"');
    expect(core).toBeGreaterThan(-1);
    expect(plugin).toBeGreaterThan(core);
    expect(html.indexOf('data-mail="magicLink"')).toBeGreaterThan(core);
    expect(html.indexOf('data-mail="emailChange"')).toBeGreaterThan(core);
    expect(html.indexOf('data-mail="galleryWelcome"')).toBeGreaterThan(plugin);
    expect(html).toContain("Sign in to Dev Site");
    expect(html).toContain("Welcome, Ann");
    // The site's override is what renders.
    expect(html).toContain("&lt;p&gt;Branded by the site&lt;/p&gt;");
  });

  test("renders in the locale the switcher picks, over the site's locales", async () => {
    const h = await galleryHarness();

    const english = await gallery(h);
    const german = await gallery(h, "?locale=de");

    expect(english).toMatch(/<a[^>]*href="\?locale=de"[^>]*>de<\/a>/);
    expect(english).toMatch(
      /<a[^>]*href="\?locale=en"[^>]*aria-current="page"/,
    );
    expect(german).toContain("Bei Dev Site anmelden");
    expect(german).not.toContain("Sign in to Dev Site");
  });

  test("lists the mail caught in dev, with the same viewer", async () => {
    const h = await galleryHarness();
    await h.factory.user.create({ email: "ann@example.test" });
    await h.dispatch(requestMagicLink("ann@example.test"));

    const html = await gallery(h);
    const sent = html.slice(html.indexOf('data-testid="plumix-mail-sent"'));

    expect(sent).toContain("ann@example.test");
    expect(sent).toContain("magic-link/verify?token=");
    expect(sent).toContain('class="plumix-mail-view"');
  });
});

declare module "../../mail/contract/registry.js" {
  interface MailRegistry {
    longNote: { readonly body: string };
  }
}

/** Sends `longNote` to `?to=`, its body as long as `?length=`. */
const noter = definePlugin("noter", {
  mails: [
    defineMail("longNote", {
      subject: () => "A long note",
      text: (props) => props.body,
      preview: { body: "x" },
    }),
  ],
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/send",
      auth: "public",
      handler: async (request, appCtx) => {
        const url = new URL(request.url);
        const length = Number(url.searchParams.get("length"));
        await appCtx.mail.send(
          "longNote",
          { body: "x".repeat(length) },
          { to: url.searchParams.get("to") ?? "" },
        );
        return new Response(null, { status: 204 });
      },
    });
  },
});

async function sendNote(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  to: string,
  length: number,
): Promise<void> {
  await h.dispatch(
    new Request(`${DEV_ORIGIN}/_plumix/noter/send?to=${to}&length=${length}`),
  );
}

async function caughtMail(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
): Promise<CaughtMail[]> {
  const listed = await h.dispatch(new Request(`${DEV_ORIGIN}${SENT_PATH}`));
  return (await listed.json()) as CaughtMail[];
}

describe("the caught mail is capped by dev.history, like the request history", () => {
  test("a raised string limit keeps a long body whole", async () => {
    const h = await createDispatcherHarness({
      config: {
        mailer: undefined,
        plugins: [noter],
        dev: { history: { maxStringLength: 20_000 } },
      },
    });

    await sendNote(h, "a@example.test", 10_000);

    expect((await caughtMail(h))[0]?.text).toBe("x".repeat(10_000));
  });

  test("maxEntries keeps only the newest mail", async () => {
    const h = await createDispatcherHarness({
      config: {
        mailer: undefined,
        plugins: [noter],
        dev: { history: { maxEntries: 1 } },
      },
    });

    await sendNote(h, "a@example.test", 1);
    await sendNote(h, "b@example.test", 1);

    expect((await caughtMail(h)).map((mail) => mail.to)).toEqual([
      "b@example.test",
    ]);
  });

  test("maxTotalBytes evicts the oldest mail past the budget", async () => {
    const h = await createDispatcherHarness({
      config: {
        mailer: undefined,
        plugins: [noter],
        dev: { history: { maxTotalBytes: 3_000 } },
      },
    });

    await sendNote(h, "a@example.test", 2000);
    await sendNote(h, "b@example.test", 2000);

    expect((await caughtMail(h)).map((mail) => mail.to)).toEqual([
      "b@example.test",
    ]);
  });
});
