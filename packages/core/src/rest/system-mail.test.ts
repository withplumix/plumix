import * as v from "valibot";
import { describe, expect, test } from "vitest";

import type { Mailer } from "../auth/contract/mailer.js";
import type {
  CreateDispatcherHarnessOptions,
  DispatcherHarness,
} from "../test/dispatcher.js";
import { definePlugin } from "../plugin/define.js";
import { createDispatcherHarness } from "../test/dispatcher.js";

const MAIL_TEST_PATH = "/_plumix/api/v1/system/mail/test";

function restHarness(
  options: CreateDispatcherHarnessOptions = {},
): Promise<DispatcherHarness> {
  return createDispatcherHarness({
    ...options,
    config: { api: { enabled: true }, ...options.config },
  });
}

function mailTestRequest(body: unknown, secret?: string): Request {
  return new Request(`https://cms.example${MAIL_TEST_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret === undefined ? {} : { authorization: `Bearer ${secret}` }),
    },
    body: JSON.stringify(body),
  });
}

async function tokenFor(
  h: DispatcherHarness,
  role: "editor" | "admin",
  scopes: string[] | null = null,
): Promise<string> {
  const user = await h.factory.user.create({ role });
  const { secret } = await h.factory.apiToken.create({
    userId: user.id,
    scopes,
    expiresAt: null,
  });
  return secret;
}

describe("POST /_plumix/api/v1/system/mail/test", () => {
  test("a token whose user may manage settings sends mailTest and gets 204", async () => {
    const h = await restHarness();
    const secret = await tokenFor(h, "admin");

    const res = await h.dispatch(
      mailTestRequest({ to: "ann@example.com" }, secret),
    );

    expect(res.status).toBe(204);
    h.mail.assertSent("mailTest", {
      to: "ann@example.com",
      times: 1,
      where: (props) => props.origin === "remote",
    });
  });

  test("a token whose user may not manage settings gets 403 and nothing is sent", async () => {
    const h = await restHarness();
    const secret = await tokenFor(h, "editor");

    const res = await h.dispatch(
      mailTestRequest({ to: "ann@example.com" }, secret),
    );

    expect(res.status).toBe(403);
    h.mail.assertNothingSent();
  });

  test("an admin's token scoped without settings:manage gets 403", async () => {
    const h = await restHarness();
    const secret = await tokenFor(h, "admin", ["entry:post:read"]);

    const res = await h.dispatch(
      mailTestRequest({ to: "ann@example.com" }, secret),
    );

    expect(res.status).toBe(403);
    h.mail.assertNothingSent();
  });

  test("an anonymous request gets 401 and nothing is sent", async () => {
    const h = await restHarness();

    const res = await h.dispatch(mailTestRequest({ to: "ann@example.com" }));

    expect(res.status).toBe(401);
    h.mail.assertNothingSent();
  });

  test("a failing transport gets 502 with the transport's message verbatim", async () => {
    const mailer: Mailer = {
      send: () => Promise.reject(new Error("SMTP 535 auth failed")),
    };
    const h = await restHarness({ config: { mailer } });
    const secret = await tokenFor(h, "admin");

    const res = await h.dispatch(
      mailTestRequest({ to: "ann@example.com" }, secret),
    );

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: { code: "mail_send_failed", message: "SMTP 535 auth failed" },
    });
  });

  test("is listed in the OpenAPI document", async () => {
    const h = await restHarness();

    const spec = (await (
      await h.dispatch(
        new Request("https://cms.example/_plumix/api/v1/openapi.json"),
      )
    ).json()) as { paths: Record<string, Record<string, unknown>> };

    expect(Object.keys(spec.paths["/system/mail/test"] ?? {})).toEqual([
      "post",
    ]);
  });

  test("a plugin resource that would shadow it is rejected at boot", async () => {
    const shadow = definePlugin("shadow", (ctx) => {
      ctx.registerRestResource({
        method: "POST",
        path: "/system/mail/{action}",
        auth: "public",
        output: v.object({ ok: v.boolean() }),
        handler: () => ({ ok: true }),
      });
    });

    await expect(
      restHarness({ config: { plugins: [shadow] } }),
    ).rejects.toThrow(/shadow/);
  });
});
