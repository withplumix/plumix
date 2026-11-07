import { testSite } from "plumix/test";
import { test } from "vitest";

const site = await testSite();

test("the home page greets you through the fallback template", async () => {
  const page = await site.visit("/");

  page
    .assertOk()
    .assertTemplate("fallback")
    .assertSee("Your Plumix site is running");
});
