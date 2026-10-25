import { describe, expect, test } from "vitest";

import { definePlugin } from "../plugin/define.js";
import { testSite } from "./site.js";

/** Answers each response shape a page assertion reads. */
const probe = definePlugin("probe", {
  setup: (ctx) => {
    ctx.registerEntryType("post", { label: "Posts", isPublic: true });
    ctx.registerRoute({
      method: "GET",
      path: "/json",
      auth: "public",
      handler: () =>
        Response.json(
          { greeting: "hi", count: 1 },
          { headers: { "x-probe": "yes" } },
        ),
    });
    ctx.registerRoute({
      method: "GET",
      path: "/forbidden",
      auth: "public",
      handler: () => new Response("No.", { status: 403 }),
    });
    ctx.registerRoute({
      method: "GET",
      path: "/moved",
      auth: "public",
      handler: () =>
        new Response(null, { status: 302, headers: { location: "/there" } }),
    });
  },
});

const site = await testSite({ plugins: [probe] });

describe("a page's status assertions", () => {
  test("assertOk passes on 200", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertOk()).not.toThrow();
  });

  test("assertOk names the status it got", async () => {
    const page = await site.visit("/nowhere");

    expect(() => page.assertOk()).toThrow(
      "assertOk: expected status 200, got 404.",
    );
  });

  test("assertNotFound passes on 404", async () => {
    const page = await site.visit("/nowhere");

    expect(() => page.assertNotFound()).not.toThrow();
  });

  test("assertNotFound names the status it got", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertNotFound()).toThrow(
      "assertNotFound: expected status 404, got 200.",
    );
  });

  test("assertForbidden passes on 403", async () => {
    const page = await site.visit("/_plumix/probe/forbidden");

    expect(() => page.assertForbidden()).not.toThrow();
  });

  test("assertForbidden names the status it got", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertForbidden()).toThrow(
      "assertForbidden: expected status 403, got 200.",
    );
  });
});

describe("assertRedirect", () => {
  test.each(["/there", "https://cms.example/there"])(
    "passes on a redirect to %s",
    async (to) => {
      const page = await site.visit("/_plumix/probe/moved");

      expect(() => page.assertRedirect(to)).not.toThrow();
    },
  );

  test("names where the redirect went instead", async () => {
    const page = await site.visit("/_plumix/probe/moved");

    expect(() => page.assertRedirect("/elsewhere")).toThrow(
      'assertRedirect: expected a redirect to "/elsewhere", got one to "/there".',
    );
  });

  test("names the status of a page that did not redirect", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertRedirect("/there")).toThrow(
      'assertRedirect: expected a redirect to "/there", got status 200.',
    );
  });
});

describe("a page's text assertions", () => {
  test.each(["Fish & Chips", "<ul>"])(
    "assertSee passes on %s, as written or escaped",
    async (text) => {
      await site.factory.published.create({ title: "Fish & Chips" });
      const page = await site.visit("/");

      expect(() => page.assertSee(text)).not.toThrow();
    },
  );

  test("assertSee names the text it missed and shows the page", async () => {
    await site.factory.published.create({ title: "Fish & Chips" });
    const page = await site.visit("/");

    expect(() => page.assertSee("Mushy peas")).toThrow(
      /^assertSee: expected the page to contain "Mushy peas", but it does not\.\n.*Fish &amp; Chips/s,
    );
  });

  test("assertDontSee passes on absent text", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertDontSee("bye")).not.toThrow();
  });

  test("assertDontSee names the text it found", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertDontSee("hi")).toThrow(
      'assertDontSee: expected the page not to contain "hi", but it does.',
    );
  });
});

describe("a page's routing assertions", () => {
  test("assertTemplate passes on the template that rendered", async () => {
    const page = await site.visit("/");

    expect(() => page.assertTemplate("fallback")).not.toThrow();
  });

  test("assertTemplate names the template that rendered instead", async () => {
    const page = await site.visit("/");

    expect(() => page.assertTemplate("front-page")).toThrow(
      'assertTemplate: expected "front-page", got "fallback".',
    );
  });

  test("assertTemplate says when no template rendered", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertTemplate("fallback")).toThrow(
      'assertTemplate: expected "fallback", but no template rendered.',
    );
  });

  test("assertRoute passes on the route pattern that matched", async () => {
    const page = await site.visit("/");

    expect(() => page.assertRoute("/")).not.toThrow();
  });

  test("assertRoute names the route pattern that matched instead", async () => {
    const page = await site.visit("/");

    expect(() => page.assertRoute("/:slug")).toThrow(
      'assertRoute: expected route "/:slug", got "/".',
    );
  });

  test("assertRoute says when no content route matched", async () => {
    const page = await site.visit("/nowhere/at-all");

    expect(() => page.assertRoute("/")).toThrow(
      'assertRoute: expected route "/", but no content route matched.',
    );
  });
});

describe("a page's header and body assertions", () => {
  test.each([[undefined], ["yes"]])(
    "assertHeader passes on a header with the value %s",
    async (value) => {
      const page = await site.visit("/_plumix/probe/json");

      expect(() => page.assertHeader("X-Probe", value)).not.toThrow();
    },
  );

  test("assertHeader names the value it found", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertHeader("x-probe", "no")).toThrow(
      'assertHeader: expected "x-probe" to be "no", got "yes".',
    );
  });

  test("assertHeader says when the header is missing", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertHeader("x-missing")).toThrow(
      'assertHeader: expected a "x-missing" header, but there is none.',
    );
  });

  test("assertJson passes on a subset of the body", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertJson({ greeting: "hi" })).not.toThrow();
  });

  test("assertJson shows the body it got", async () => {
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertJson({ greeting: "bye" })).toThrow(
      'assertJson: expected the body to match {"greeting":"bye"}, got {"greeting":"hi","count":1}.',
    );
  });

  test("assertJson says when the body is not JSON", async () => {
    const page = await site.visit("/_plumix/probe/forbidden");

    expect(() => page.assertJson({})).toThrow(
      "assertJson: expected a JSON body, got: No.",
    );
  });
});
