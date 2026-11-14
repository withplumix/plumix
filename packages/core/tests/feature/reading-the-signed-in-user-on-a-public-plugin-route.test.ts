import { describe, expect, test } from "vitest";

import type { AppContext } from "../../src/context/app-context.js";
import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const whoami = (_request: Request, ctx: AppContext): Response =>
  Response.json({ userId: ctx.user?.id ?? null });

const probe = definePlugin("probe", {
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/whoami",
      auth: "public",
      handler: whoami,
    });
    ctx.registerRoute({
      method: "GET",
      path: "/cached-whoami",
      auth: "public",
      cacheable: true,
      handler: whoami,
    });
    ctx.registerRoute({
      method: "POST",
      path: "/submit",
      auth: "public",
      formPost: true,
      handler: whoami,
    });
  },
});

const site = await testSite({ plugins: [probe] });

/**
 * `site.visit` adds the CSRF header to every `/_plumix/` request unless one is
 * given, so a form post, which carries none, sends it empty.
 */
const formPost = {
  method: "POST",
  headers: {
    "x-plumix-request": "",
    "content-type": "application/x-www-form-urlencoded",
    origin: "https://cms.example",
  },
  body: "",
} as const;

const userIdOf = (body: string): unknown =>
  (JSON.parse(body) as { userId: unknown }).userId;

describe("a public plugin route", () => {
  test("sees the signed-in user", async () => {
    const user = await site.factory.member.create();

    const page = await site.actingAs(user).visit("/_plumix/probe/whoami");

    expect(userIdOf(page.body)).toBe(user.id);
  });

  test("sees nobody without a session", async () => {
    const page = await site.visit("/_plumix/probe/whoami");

    expect(userIdOf(page.body)).toBeNull();
  });

  test("sees nobody for a request bearing only an API token", async () => {
    const user = await site.factory.member.create();
    const { secret } = await site.factory.apiToken.create({ userId: user.id });

    const page = await site.visit("/_plumix/probe/whoami", {
      headers: { authorization: `Bearer ${secret}` },
    });

    expect(userIdOf(page.body)).toBeNull();
  });
});

describe("a cacheable plugin route", () => {
  test("sees nobody even with a session, so no stored copy holds a member", async () => {
    const user = await site.factory.member.create();

    const page = await site
      .actingAs(user)
      .visit("/_plumix/probe/cached-whoami");

    expect(userIdOf(page.body)).toBeNull();
  });
});

describe("a formPost plugin route", () => {
  test("sees nobody on a form post, even with a session", async () => {
    const user = await site.factory.member.create();

    const page = await site
      .actingAs(user)
      .visit("/_plumix/probe/submit", formPost);

    expect(userIdOf(page.body)).toBeNull();
  });

  test("sees the signed-in user on a fetch that passed the CSRF gate", async () => {
    const user = await site.factory.member.create();

    const page = await site
      .actingAs(user)
      .visit("/_plumix/probe/submit", { method: "POST" });

    expect(userIdOf(page.body)).toBe(user.id);
  });
});
