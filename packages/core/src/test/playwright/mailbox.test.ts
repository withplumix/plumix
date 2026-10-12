import type { APIRequestContext } from "@playwright/test";
import { describe, expect, test } from "vitest";

import type { CaughtMail } from "../../context/dev-runtime.js";
import { createMailbox } from "./mailbox.js";

function caught(id: string, to: string, name = "magicLink"): CaughtMail {
  return {
    id,
    at: 0,
    name,
    locale: "en",
    props: { url: `https://cms.example/${id}` },
    to,
    subject: `subject ${id}`,
    text: "text",
    html: "<p>html</p>",
  };
}

function requestOf(responses: readonly (readonly CaughtMail[])[]) {
  const calls: { method: string; path: string; headers?: object }[] = [];
  let polls = 0;
  const reply = (ok: boolean, body: unknown) => ({
    ok: () => ok,
    json: () => Promise.resolve(body),
  });
  const request = {
    get: (path: string) => {
      calls.push({ method: "GET", path });
      const body = responses[Math.min(polls, responses.length - 1)];
      polls += 1;
      return Promise.resolve(reply(true, body));
    },
    delete: (path: string, options: { headers: object }) => {
      calls.push({ method: "DELETE", path, headers: options.headers });
      return Promise.resolve(reply(true, undefined));
    },
  };
  // Safety: the mailbox calls only `get` and `delete` on the request.
  return { request: request as unknown as APIRequestContext, calls };
}

describe("mailbox", () => {
  test("latest returns the first match of the name sent to the address", async () => {
    const { request } = requestOf([
      [
        caught("3", "bob@example.test"),
        caught("2", "ann@example.test", "emailChange"),
        caught("1", "ann@example.test"),
      ],
    ]);
    const mail = await createMailbox(request).latest("magicLink", {
      to: "ann@example.test",
    });
    expect(mail).toEqual({
      props: { url: "https://cms.example/1" },
      to: "ann@example.test",
      subject: "subject 1",
      text: "text",
      html: "<p>html</p>",
    });
  });

  test("latest polls until a match arrives", async () => {
    const { request, calls } = requestOf([
      [],
      [caught("1", "bob@example.test")],
      [caught("2", "ann@example.test")],
    ]);
    const mail = await createMailbox(request).latest("magicLink", {
      to: "ann@example.test",
    });
    expect(mail.subject).toBe("subject 2");
    expect(calls.map((call) => call.path)).toEqual(
      Array(3).fill("/_plumix/debug/mail/sent"),
    );
  });

  test("clear deletes the caught mail with the request header", async () => {
    const { request, calls } = requestOf([[]]);
    await createMailbox(request).clear();
    expect(calls).toEqual([
      {
        method: "DELETE",
        path: "/_plumix/debug/mail/sent",
        headers: { "x-plumix-request": "1" },
      },
    ]);
  });
});
