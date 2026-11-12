import { test as base, PNG_1X1 } from "plumix/test/playwright";

export { expect } from "plumix/test/playwright";

/**
 * The seed points every image at picsum.photos. Serving them here keeps a page's
 * `load`, which `page.goto` waits on, off that host's uptime.
 */
export const test = base.extend<{ seededImages: undefined }>({
  seededImages: [
    async ({ context }, use) => {
      await context.route("https://picsum.photos/**", (route) =>
        route.fulfill({ contentType: "image/png", body: PNG_1X1 }),
      );
      await use(undefined);
    },
    { auto: true },
  ],
});
