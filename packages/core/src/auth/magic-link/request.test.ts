import { describe, expect, test } from "vitest";

import type { MailSender } from "../../mail/contract/registry.js";
import { eq } from "../../db/index.js";
import { authTokens } from "../../db/schema/auth_tokens.js";
import { createMailCatalogs } from "../../mail/catalogs.js";
import { fakeMail } from "../../test/mail-fake.js";
import { poCatalogs } from "../../test/po-catalog.js";
import { renderMailIn } from "../../test/render-mail.js";
import { testSite } from "../../test/site.js";
import { hashToken } from "../tokens.js";
import { requestMagicLink } from "./request.js";

/** Magic link needs a mailer; the site swaps in its own fake for it. */
const site = await testSite({
  plugins: [],
  config: {
    mailer: fakeMail(),
    auth: { magicLink: { siteName: "Test Site" } },
  },
});

/** The arguments the request route passes, for an address. */
function requestFor(email: string) {
  return {
    email,
    origin: "https://cms.example",
    basePath: "",
    mail: site.context.mail,
  };
}

/** The token row the emailed link's token hashes to. */
async function tokenRowOf(text: string) {
  const token = /token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? "";
  return site.context.db.query.authTokens.findFirst({
    where: eq(authTokens.hash, await hashToken(token)),
  });
}

describe("requestMagicLink", () => {
  test("issues a token + sends email when the user exists", async () => {
    const user = await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });

    await requestMagicLink(site.context.db, requestFor("alice@example.com"));

    const sent = site.mail.sent("magicLink");
    expect(sent).toHaveLength(1);
    const [message] = sent;
    expect(message?.to).toBe("alice@example.com");
    expect(message?.subject).toContain("Test Site");
    expect(message?.text).toContain(
      "https://cms.example/_plumix/auth/magic-link/verify?token=",
    );
    expect(message?.html).toContain(
      "https://cms.example/_plumix/auth/magic-link/verify?token=",
    );
    // The row is keyed by SHA-256 of the token the link carries.
    const row = await tokenRowOf(message?.text ?? "");
    expect(row?.type).toBe("magic_link");
    expect(row?.userId).toBe(user.id);
    expect(row?.email).toBe("alice@example.com");
  });

  test("silently no-ops when the email is unregistered", async () => {
    await requestMagicLink(site.context.db, requestFor("stranger@example.com"));

    site.mail.assertNothingSent();
    const all = await site.context.db.select().from(authTokens);
    expect(all).toHaveLength(0);
  });

  test("silently no-ops when the user is disabled", async () => {
    await site.factory.user.create({
      email: "blocked@example.com",
      role: "editor",
      disabledAt: new Date("2026-01-01T00:00:00Z"),
    });

    await requestMagicLink(site.context.db, requestFor("blocked@example.com"));

    site.mail.assertNothingSent();
  });

  test("normalises email to lowercase before lookup", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });

    await requestMagicLink(
      site.context.db,
      requestFor("  Alice@Example.com  "),
    );

    site.mail.assertSent("magicLink", { to: "alice@example.com", times: 1 });
  });

  test("signup: listed domain → token issued with userId=null + email sent", async () => {
    // One user satisfies the bootstrap rail.
    await site.factory.user.create({ role: "admin" });

    await requestMagicLink(site.context.db, {
      ...requestFor("newcomer@example.com"),
      allowedDomains: { "example.com": "editor" },
    });

    const sent = site.mail.sent("magicLink");
    expect(sent).toHaveLength(1);
    const row = await tokenRowOf(sent[0]?.text ?? "");
    expect(row?.type).toBe("magic_link");
    expect(row?.userId).toBeNull();
    expect(row?.email).toBe("newcomer@example.com");
  });

  test("signup: a listed domain matches whatever its case", async () => {
    await site.factory.user.create({ role: "admin" });

    await requestMagicLink(site.context.db, {
      ...requestFor("Ann@Example.COM"),
      allowedDomains: { "example.com": "editor" },
    });

    site.mail.assertSentCount(1);
  });

  test("signup: an unlisted domain silently no-ops", async () => {
    await site.factory.user.create({ role: "admin" });

    await requestMagicLink(site.context.db, {
      ...requestFor("bob@other.com"),
      allowedDomains: { "example.com": "editor" },
    });

    site.mail.assertNothingSent();
  });

  test("signup: zero-user system refuses signup (bootstrap is passkey-only)", async () => {
    await requestMagicLink(site.context.db, {
      ...requestFor("first@example.com"),
      allowedDomains: { "example.com": "editor" },
    });

    site.mail.assertNothingSent();
    const tokens = await site.context.db.select().from(authTokens);
    expect(tokens).toHaveLength(0);
  });

  test("signup: bootstrapAllowed=true issues a token even with zero users", async () => {
    await requestMagicLink(site.context.db, {
      ...requestFor("first@example.com"),
      allowedDomains: { "example.com": "editor" },
      bootstrapAllowed: true,
    });

    site.mail.assertSentCount(1);
    const tokens = await site.context.db.select().from(authTokens);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.email).toBe("first@example.com");
    expect(tokens[0]?.userId).toBeNull();
  });

  test("selfSignup: unlisted domain → token issued for a new email", async () => {
    // The domain is unlisted, but open self-signup issues the token.
    await site.factory.user.create({ role: "admin" });

    await requestMagicLink(site.context.db, {
      ...requestFor("stranger@anywhere.test"),
      defaultRole: "member",
    });

    site.mail.assertSentCount(1);
    const tokens = await site.context.db.select().from(authTokens);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.userId).toBeNull();
    expect(tokens[0]?.email).toBe("stranger@anywhere.test");
  });

  test("selfSignup: zero-user system still refuses (bootstrap rail holds)", async () => {
    await requestMagicLink(site.context.db, {
      ...requestFor("first@anywhere.test"),
      defaultRole: "member",
    });

    site.mail.assertNothingSent();
    const tokens = await site.context.db.select().from(authTokens);
    expect(tokens).toHaveLength(0);
  });

  test("selfSignup: malformed email (no domain) silently no-ops", async () => {
    await site.factory.user.create({ role: "admin" });

    await requestMagicLink(site.context.db, {
      ...requestFor("not-an-email"),
      defaultRole: "member",
    });

    site.mail.assertNothingSent();
  });

  test("swallows mailer errors so the response shape never leaks success", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    const failing: MailSender = {
      send: () => Promise.reject(new Error("smtp down")),
    };

    await expect(
      requestMagicLink(site.context.db, {
        ...requestFor("alice@example.com"),
        mail: failing,
        logger: site.context.logger,
      }),
    ).resolves.toBeUndefined();
    site.logger.assertLogged("warn", "magic_link_mailer_failed");
  });
});

// That the mail follows the request's locale is a feature test, in
// tests/feature/requesting-a-magic-link.test.ts; a test site renders with the
// stubbed catalogs, so the German text is checked here.
describe("the magicLink mail in German", () => {
  test("reads the shipped catalog", async () => {
    // Core's own catalog, which unit tests otherwise resolve to empty.
    const catalogs = createMailCatalogs(
      poCatalogs({
        de: new URL("../../../locales/mail-de.po", import.meta.url),
      }),
    );

    const sent = await renderMailIn(
      catalogs,
      "magicLink",
      {
        url: "https://cms.example/_plumix/auth/magic-link/verify?token=t",
        ttlSeconds: 15 * 60,
      },
      {
        locale: "de",
        config: { auth: { magicLink: { siteName: "Test Site" } } },
      },
    );

    expect(sent.subject).toBe("Bei Test Site anmelden");
    expect(sent.text).toContain("Melden Sie sich bei Test Site");
  });
});

describe("requestMagicLink — per-email issuance cap", () => {
  test("stops issuing once an email hits the cap within the window", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    // Five live tokens already issued to this address this window.
    await site.factory.authToken.createList(5, {
      type: "magic_link",
      email: "alice@example.com",
    });

    await requestMagicLink(site.context.db, requestFor("alice@example.com"));

    // Over the cap → silent no-op, no sixth token minted.
    site.mail.assertNothingSent();
    const rows = await site.context.db.select().from(authTokens);
    expect(rows).toHaveLength(5);
  });

  test("still issues while below the cap", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    await site.factory.authToken.createList(4, {
      type: "magic_link",
      email: "alice@example.com",
    });

    await requestMagicLink(site.context.db, requestFor("alice@example.com"));

    site.mail.assertSentCount(1);
    const rows = await site.context.db.select().from(authTokens);
    expect(rows).toHaveLength(5);
  });

  test("the cap is per-email — a flooded address never blocks another", async () => {
    await site.factory.user.create({
      email: "alice@example.com",
      role: "editor",
    });
    // Bob is flooded; Alice's request must still go through.
    await site.factory.authToken.createList(5, {
      type: "magic_link",
      email: "bob@example.com",
    });

    await requestMagicLink(site.context.db, requestFor("alice@example.com"));

    site.mail.assertSent("magicLink", { to: "alice@example.com", times: 1 });
  });
});
