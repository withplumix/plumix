import { expect, test } from "vitest";

import { createDispatcherHarness } from "./test/dispatcher.js";
import { welcomeTheme } from "./welcome-theme.js";

test("a theme-less site renders the welcome screen at /", async () => {
  const h = await createDispatcherHarness({ theme: welcomeTheme });
  const response = await h.dispatch(new Request("https://cms.example/"));
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body).toContain('data-testid="plumix-welcome"');
});

test("the welcome screen is marked noindex", async () => {
  const h = await createDispatcherHarness({ theme: welcomeTheme });
  const response = await h.dispatch(new Request("https://cms.example/"));
  const body = await response.text();
  expect(body).toContain('name="robots"');
  expect(body).toContain('content="noindex"');
});

test("the welcome screen is self-contained — inline style, no external fetch", async () => {
  const h = await createDispatcherHarness({ theme: welcomeTheme });
  const response = await h.dispatch(new Request("https://cms.example/"));
  const body = await response.text();
  expect(body).toContain("<style");
  expect(body).not.toContain('rel="stylesheet"');
});

test("the welcome screen respects a dark-mode preference", async () => {
  const h = await createDispatcherHarness({ theme: welcomeTheme });
  const response = await h.dispatch(new Request("https://cms.example/"));
  const body = await response.text();
  expect(body).toContain("prefers-color-scheme: dark");
});

test("the status dot animation is disabled under reduced motion", async () => {
  const h = await createDispatcherHarness({ theme: welcomeTheme });
  const response = await h.dispatch(new Request("https://cms.example/"));
  const body = await response.text();
  expect(body).toContain("prefers-reduced-motion: reduce");
});

test("the admin link is prefixed with the configured basePath", async () => {
  const h = await createDispatcherHarness({
    theme: welcomeTheme,
    basePath: "/blog",
  });
  const response = await h.dispatch(new Request("https://cms.example/blog/"));
  const body = await response.text();
  expect(body).toContain('href="/blog/_plumix/admin"');
});
