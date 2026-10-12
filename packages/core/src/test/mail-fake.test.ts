import { describe, expect, expectTypeOf, test } from "vitest";

import type { EmailMessage } from "../auth/contract/mailer.js";
import type { MagicLinkMailProps } from "../mail/core-mails.js";
import { createDispatcherHarness } from "./dispatcher.js";
import { fakeMail } from "./mail-fake.js";
import { createRpcHarness } from "./rpc.js";

function requestMagicLink(
  h: Awaited<ReturnType<typeof createDispatcherHarness>>,
  email: string,
) {
  return h.fetch("/_plumix/auth/magic-link/request", {
    method: "POST",
    json: { email },
  });
}

describe("the dispatcher harness's mail fake", () => {
  test("records the magic link a sign-in request sends", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Test Site" } } },
    });
    await h.factory.user.create({ email: "ann@example.test" });

    await requestMagicLink(h, "ann@example.test");

    h.mail.assertSent("magicLink", { to: "ann@example.test" });
    h.mail.assertNotSent("emailChange");
  });
});

describe("a harness given its own mailer", () => {
  test("hands the mail to that mailer, and the fake still records it", async () => {
    const delivered: EmailMessage[] = [];
    const h = await createDispatcherHarness({
      config: {
        mailer: {
          send: (message) => {
            delivered.push(message);
            return Promise.resolve();
          },
        },
        auth: { magicLink: { siteName: "Test Site" } },
      },
    });
    await h.factory.user.create({ email: "ann@example.test" });

    await requestMagicLink(h, "ann@example.test");

    expect(delivered.map((message) => message.to)).toEqual([
      "ann@example.test",
    ]);
    h.mail.assertSentCount(1);
  });

  test("records nothing the mailer rejected", async () => {
    const h = await createDispatcherHarness({
      config: {
        mailer: { send: () => Promise.reject(new Error("smtp down")) },
        auth: { magicLink: { siteName: "Test Site" } },
      },
    });
    await h.factory.user.create({ email: "ann@example.test" });

    await requestMagicLink(h, "ann@example.test");

    h.mail.assertNothingSent();
  });
});

describe("the RPC harness's mail fake", () => {
  test("records an email-change confirmation with its props", async () => {
    const h = await createRpcHarness({
      authAs: "editor",
      config: { auth: { magicLink: { siteName: "Test Site" } } },
    });

    await h.client.user.requestEmailChange({
      id: h.user.id,
      newEmail: "new@example.test",
    });

    h.mail.assertSent("emailChange", {
      to: "new@example.test",
      where: (props) => props.newEmail === "new@example.test",
      times: 1,
    });
  });
});

describe("a failing mail assertion", () => {
  test("lists each mail actually sent, by name and recipient", async () => {
    const h = await createDispatcherHarness({
      config: { auth: { magicLink: { siteName: "Test Site" } } },
    });
    await h.factory.user.create({ email: "ann@example.test" });
    await requestMagicLink(h, "ann@example.test");

    expect(() => {
      h.mail.assertSent("magicLink", { to: "bob@example.test" });
    }).toThrow(
      'Expected mail "magicLink" to bob@example.test to be sent, but it was ' +
        'sent 0 times.\nMail sent:\n  - "magicLink" to ann@example.test',
    );
  });
});

/** A mail as `ctx.mail.send` hands it over once the transport took it. */
function magicLinkTo(to: string, url: string) {
  return {
    name: "magicLink",
    props: { url, ttlSeconds: 900 },
    locale: "en",
    message: { to, subject: "Sign in", text: url, html: `<a>${url}</a>` },
  };
}

describe("fakeMail", () => {
  test("lists each mail of a name with its props and rendered message", () => {
    const mail = fakeMail();
    mail.record(magicLinkTo("ann@example.test", "https://cms.example/a"));

    expect(mail.sent("magicLink")).toEqual([
      {
        props: { url: "https://cms.example/a", ttlSeconds: 900 },
        to: "ann@example.test",
        subject: "Sign in",
        text: "https://cms.example/a",
        html: "<a>https://cms.example/a</a>",
      },
    ]);
    expect(mail.sent("emailChange")).toEqual([]);
  });

  test("assertSent with `times` fails on any other count", () => {
    const mail = fakeMail();
    mail.record(magicLinkTo("ann@example.test", "https://cms.example/a"));
    mail.record(magicLinkTo("ann@example.test", "https://cms.example/b"));

    expect(() => {
      mail.assertSent("magicLink", { times: 1 });
    }).toThrow(
      'Expected mail "magicLink" to be sent 1 time, but it was sent 2 times.',
    );
  });

  test("assertNotSent fails on a mail matching `where`", () => {
    const mail = fakeMail();
    mail.record(magicLinkTo("ann@example.test", "https://cms.example/a"));

    expect(() => {
      mail.assertNotSent("magicLink", {
        where: (props) => props.url.endsWith("/a"),
      });
    }).toThrow(
      'Expected mail "magicLink" matching `where` not to be sent, but it was ' +
        "sent 1 time.",
    );
  });

  test("assertNothingSent fails once any mail was sent", () => {
    const mail = fakeMail();
    mail.record(magicLinkTo("ann@example.test", "https://cms.example/a"));

    expect(() => {
      mail.assertNothingSent();
    }).toThrow(
      "Expected no mail to be sent, but 1 was.\nMail sent:\n" +
        '  - "magicLink" to ann@example.test',
    );
  });

  test("assertSentCount counts mail of every name", () => {
    const mail = fakeMail();

    expect(() => {
      mail.assertSentCount(2);
    }).toThrow("Expected 2 mails to be sent, but 0 were.\nNo mail was sent.");
  });
});

describe("MailFake types", () => {
  test("rejects an undeclared name and props the mail does not take", () => {
    const mail = fakeMail();

    // @ts-expect-error: no mail is declared as `magicLnk`.
    expectTypeOf(mail.assertSent).toBeCallableWith("magicLnk");
    expectTypeOf(mail.assertSent).toBeCallableWith("magicLink", {
      // @ts-expect-error: `magicLink`'s props have no `name`.
      where: (props: { readonly name: string }) => props.name === "Ann",
    });
    expectTypeOf(mail.sent("magicLink"))
      .items.toHaveProperty("props")
      .toEqualTypeOf<MagicLinkMailProps>();
  });
});
