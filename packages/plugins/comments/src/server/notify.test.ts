import type { EmailMessage } from "plumix";
import { describe, expect, test } from "vitest";

import type { Harness } from "../test/harness.js";
import { harnessWith, seedPost } from "../test/harness.js";

function capturingMailer() {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send: (message: EmailMessage) => {
      sent.push(message);
      return Promise.resolve();
    },
  };
}

function submit(harness: Harness, entryId: number, body: string) {
  return harness.fetch("/_plumix/comments/submit", {
    method: "POST",
    json: { entryId, name: "Ada <3", email: "ada@example.test", body },
  });
}

const HELD = { entryTypes: ["post"], mode: "all" } as const;

describe("the commentAwaitingModeration mail", () => {
  test("goes to the moderator with the comment, its entry and the queue", async () => {
    const mailer = capturingMailer();
    const harness = await harnessWith(
      { ...HELD, notifyEmail: "mod@example.test" },
      { config: { mailer } },
    );
    const entry = await seedPost(harness, { title: "Hello world" });

    await submit(harness, entry.id, "First <b>post</b>");

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      to: "mod@example.test",
      subject: "A comment is awaiting moderation",
      text: [
        "Ada <3 left a comment on “Hello world” that's held for review:",
        "",
        "First <b>post</b>",
        "",
        "Review it in the moderation queue:",
        "",
        "https://cms.example/_plumix/admin/pages/comments",
      ].join("\n"),
    });
    expect(mailer.sent[0]?.html).toContain("First &lt;b&gt;post&lt;/b&gt;");
    expect(mailer.sent[0]?.html).toContain(
      '<a href="https://cms.example/_plumix/admin/pages/comments">',
    );
    expect(mailer.sent[0]?.html).toContain("Ada &lt;3");
  });

  test("is in the moderator's own locale", async () => {
    const mailer = capturingMailer();
    const harness = await harnessWith(
      { ...HELD, notifyEmail: "mod@example.test" },
      {
        config: {
          mailer,
          i18n: { defaultLocale: "en", locales: ["en", "de"] },
        },
        pluginCatalogs: {
          de: [
            () =>
              Promise.resolve({
                messages: {
                  "plugin.comments.mail.pending.subject":
                    "Ein Kommentar wartet auf Freigabe",
                  "plugin.comments.mail.pending.review":
                    "Prüfen Sie ihn in der Moderationswarteschlange:",
                },
              }),
          ],
        },
      },
    );
    await harness.factory.user.create({
      email: "mod@example.test",
      meta: { locale: "de" },
    });
    const entry = await seedPost(harness);

    await submit(harness, entry.id, "hello");

    expect(mailer.sent[0]?.subject).toBe("Ein Kommentar wartet auf Freigabe");
    expect(mailer.sent[0]?.text).toContain(
      "Prüfen Sie ihn in der Moderationswarteschlange:",
    );
  });

  test("is not sent for a comment that is not held", async () => {
    const mailer = capturingMailer();
    const harness = await harnessWith(
      { entryTypes: ["post"], mode: "none", notifyEmail: "mod@example.test" },
      { config: { mailer } },
    );
    const entry = await seedPost(harness);

    await submit(harness, entry.id, "hello");

    expect(mailer.sent).toEqual([]);
  });

  test("is skipped without failing the comment when no mailer is configured", async () => {
    const harness = await harnessWith({
      ...HELD,
      notifyEmail: "mod@example.test",
    });
    const entry = await seedPost(harness);

    const res = await submit(harness, entry.id, "hello");

    res.assertStatus(200);
    expect(await res.json()).toEqual({ status: "pending" });
  });
});
