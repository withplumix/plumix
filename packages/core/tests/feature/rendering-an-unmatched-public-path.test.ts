import { describe, expect, test } from "vitest";

import { testSite } from "../../src/test/site.js";

const site = await testSite({});

describe("an unmatched public path", () => {
  test("at the root renders as the front page", async () => {
    const page = await site.visit("/");

    page.assertOk().assertRoute("/");
  });

  test("anywhere else renders a 404 with no route", async () => {
    const page = await site.visit("/nowhere/at-all");

    page.assertNotFound();
    expect(() => page.assertRoute("/")).toThrow(
      'assertRoute: expected route "/", but no content route matched.',
    );
  });
});
