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
  test("assertOk passes on 200 and names the status it got", async () => {
    (await site.visit("/_plumix/probe/json")).assertOk();
    const missing = await site.visit("/nowhere");

    expect(() => missing.assertOk()).toThrow(
      "assertOk: expected status 200, got 404.",
    );
  });

  test("assertNotFound passes on 404 and names the status it got", async () => {
    (await site.visit("/nowhere")).assertNotFound();
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertNotFound()).toThrow(
      "assertNotFound: expected status 404, got 200.",
    );
  });

  test("assertForbidden passes on 403 and names the status it got", async () => {
    (await site.visit("/_plumix/probe/forbidden")).assertForbidden();
    const page = await site.visit("/_plumix/probe/json");

    expect(() => page.assertForbidden()).toThrow(
      "assertForbidden: expected status 403, got 200.",
    );
  });
});

describe("assertRedirect", () => {
  test("passes on a redirect to the path, absolute or not", async () => {
    const page = await site.visit("/_plumix/probe/moved");

    page.assertRedirect("/there").assertRedirect("https://cms.example/there");
  });

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
  test("assertSee passes on text as written or escaped, and shows the page it missed", async () => {
    await site.factory.published.create({ title: "Fish & Chips" });
    const page = await site.visit("/");

    page.assertSee("Fish & Chips").assertSee("<ul>");
    expect(() => page.assertSee("Mushy peas")).toThrow(
      /^assertSee: expected the page to contain "Mushy peas", but it does not\.\n.*Fish &amp; Chips/s,
    );
  });

  test("assertDontSee passes on absent text and names the text it found", async () => {
    const page = await site.visit("/_plumix/probe/json");

    page.assertDontSee("bye");
    expect(() => page.assertDontSee("hi")).toThrow(
      'assertDontSee: expected the page not to contain "hi", but it does.',
    );
  });
});

describe("a page's routing assertions", () => {
  test("assertTemplate names the template that rendered", async () => {
    const page = await site.visit("/");

    page.assertTemplate("fallback");
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

  test("assertRoute names the route pattern that matched", async () => {
    const page = await site.visit("/");

    page.assertRoute("/");
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
  test("assertHeader passes on presence or value and names what it found", async () => {
    const page = await site.visit("/_plumix/probe/json");

    page.assertHeader("x-probe").assertHeader("X-Probe", "yes");
    expect(() => page.assertHeader("x-probe", "no")).toThrow(
      'assertHeader: expected "x-probe" to be "no", got "yes".',
    );
    expect(() => page.assertHeader("x-missing")).toThrow(
      'assertHeader: expected a "x-missing" header, but there is none.',
    );
  });

  test("assertJson passes on a subset of the body and shows the body it got", async () => {
    const page = await site.visit("/_plumix/probe/json");

    page.assertJson({ greeting: "hi" });
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
