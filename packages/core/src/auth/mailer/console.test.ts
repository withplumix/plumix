import { describe, expect, test, vi } from "vitest";

import type { EmailMessage } from "./types.js";
import { consoleMailer } from "./console.js";

type LoggerCall = readonly [tag: string, meta: EmailMessage];

describe("consoleMailer", () => {
  test("logs the message at info level and resolves", async () => {
    const info = vi.fn();
    const mailer = consoleMailer({ logger: { info } });

    await mailer.send({
      to: "alice@example.com",
      subject: "hi",
      text: "hello",
    });

    expect(info).toHaveBeenCalledOnce();
    const call = info.mock.calls[0] as LoggerCall | undefined;
    if (!call) throw new Error("logger not called");
    const [tag, meta] = call;
    expect(tag).toBe("[mailer:console]");
    expect(meta).toMatchObject({
      to: "alice@example.com",
      subject: "hi",
      text: "hello",
    });
    expect(meta).not.toHaveProperty("html");
  });

  test("includes html when provided", async () => {
    const info = vi.fn();
    const mailer = consoleMailer({ logger: { info } });

    await mailer.send({
      to: "alice@example.com",
      subject: "hi",
      text: "hello",
      html: "<p>hello</p>",
    });

    const call = info.mock.calls[0] as LoggerCall | undefined;
    if (!call) throw new Error("logger not called");
    expect(call[1]).toMatchObject({ html: "<p>hello</p>" });
  });

  test("defaults to console when no logger is passed", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      await consoleMailer().send({
        to: "x@y.z",
        subject: "s",
        text: "t",
      });
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });
});
