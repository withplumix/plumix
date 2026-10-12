import { describe, expect, test } from "vitest";

import type { EmailMessage, Mailer } from "../contract/mailer.js";
import { ConfigError } from "../../config.errors.js";
import { alwaysTo } from "./always-to.js";
import { resolveMailer } from "./resolve.js";

function recordingMailer(): Mailer & { readonly sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    send: (message) => {
      sent.push(message);
      return Promise.resolve();
    },
  };
}

function resolve(input: ReturnType<typeof alwaysTo>, env = {}): Mailer {
  const mailer = resolveMailer(input, env);
  if (!mailer) throw new Error("alwaysTo resolved to no mailer");
  return mailer;
}

describe("alwaysTo", () => {
  test("delivers to the given address, naming the original recipient in text and html", async () => {
    const recording = recordingMailer();

    await resolve(alwaysTo("qa@site.test", recording)).send({
      to: "ann@example.com",
      subject: "Sign in",
      text: "Your link",
      html: "<p>Your link</p>",
    });

    expect(recording.sent).toHaveLength(1);
    const [message] = recording.sent;
    expect(message?.to).toBe("qa@site.test");
    expect(message?.subject).toBe("Sign in");
    expect(message?.text).toBe("Originally to: ann@example.com\n\nYour link");
    expect(message?.html).toContain("Originally to: ann@example.com");
    expect(message?.html).toMatch(/<\/p>\s*<p>Your link<\/p>$/);
  });

  test("keeps a text-only message text-only and escapes the recipient in the banner", async () => {
    const recording = recordingMailer();
    const resolved = resolve(alwaysTo("qa@site.test", recording));

    await resolved.send({ to: "ann@example.com", subject: "s", text: "t" });
    await resolved.send({
      to: "<b>@example.com",
      subject: "s",
      text: "t",
      html: "<p>t</p>",
    });

    expect(recording.sent[0]).not.toHaveProperty("html");
    expect(recording.sent[1]?.html).toBe(
      '<p style="font-size:12px;color:#666">Originally to: &lt;b&gt;@example.com</p><p>t</p>',
    );
  });

  test("resolves the address and the transport from env", async () => {
    interface StagingEnv {
      readonly STAGING_INBOX: string;
      readonly RESEND_KEY: string;
    }
    const env: StagingEnv = { STAGING_INBOX: "qa@site.test", RESEND_KEY: "k" };
    const transports = new Map<string, ReturnType<typeof recordingMailer>>();
    const resend = (key: string) => {
      const recording = recordingMailer();
      transports.set(key, recording);
      return recording;
    };

    await resolve(
      alwaysTo(
        (e) => (e as StagingEnv).STAGING_INBOX,
        (e) => resend((e as StagingEnv).RESEND_KEY),
      ),
      env,
    ).send({ to: "ann@example.com", subject: "Sign in", text: "Your link" });

    expect(transports.get("k")?.sent.map((m) => m.to)).toEqual([
      "qa@site.test",
    ]);
  });

  test.each(["", "not-an-address"])(
    "fails to resolve with a config error when the address is %j",
    (address) => {
      const resolving = () =>
        resolve(alwaysTo(() => address, recordingMailer()));

      expect(resolving).toThrow(ConfigError);
      expect(resolving).toThrow(
        `alwaysTo(): ${JSON.stringify(address)} is not an email address`,
      );
    },
  );
});
