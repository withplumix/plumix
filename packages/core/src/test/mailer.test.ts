import { describe, expect, test } from "vitest";

import { makeMailer } from "./mailer.js";

describe("makeMailer", () => {
  test("captures every message it is sent, in order", async () => {
    const mailer = makeMailer();

    await mailer.send({ to: "a@example.com", subject: "One", text: "1" });
    await mailer.send({ to: "b@example.com", subject: "Two", text: "2" });

    expect(mailer.sent).toEqual([
      { to: "a@example.com", subject: "One", text: "1" },
      { to: "b@example.com", subject: "Two", text: "2" },
    ]);
  });

  test("rejects with the failWith error and captures nothing", async () => {
    const failure = new Error("transport down");
    const mailer = makeMailer({ failWith: failure });

    await expect(
      mailer.send({ to: "a@example.com", subject: "One", text: "1" }),
    ).rejects.toBe(failure);
    expect(mailer.sent).toEqual([]);
  });
});
