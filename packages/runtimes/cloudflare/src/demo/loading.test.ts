import { describe, expect, test } from "vitest";

import { renderDemoLoadingPage } from "./loading.js";

const API_JS = "challenges.cloudflare.com/turnstile/v0/api.js";

describe("renderDemoLoadingPage", () => {
  describe("with a Turnstile site key", () => {
    const html = renderDemoLoadingPage("site-key-123");

    test("renders the widget and defers boot to its callback", () => {
      expect(html).toContain("site-key-123");
      expect(html).toContain(API_JS);
      expect(html).toContain("window.plumixDemoTurnstile = startDemo");
    });

    test("omits our card spinner so there is only one loading indicator", () => {
      expect(html).not.toContain('<div class="pdl-spinner"');
    });
  });

  describe("without a site key (local dev / e2e)", () => {
    const html = renderDemoLoadingPage();

    test("shows our spinner and boots init immediately", () => {
      expect(html).not.toContain(API_JS);
      expect(html).toContain('<div class="pdl-spinner"');
      expect(html).toContain("startDemo();");
    });
  });
});
