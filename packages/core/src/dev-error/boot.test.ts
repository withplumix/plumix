import { describe, expect, test } from "vitest";

import { ThemeRegistrationError } from "../theme-errors.js";
import { renderDevBootErrorResponse } from "./boot.js";

describe("renderDevBootErrorResponse", () => {
  test("serves a 500 HTML dev error page for a config/boot throw", async () => {
    const response = renderDevBootErrorResponse(
      ThemeRegistrationError.missingTheme(),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    const html = await response.text();
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("ThemeRegistrationError");
  });

  test("surfaces the typed error's how-to-fix hint", async () => {
    const html = await renderDevBootErrorResponse(
      ThemeRegistrationError.missingTheme(),
    ).text();

    // Core's typed matcher recognizes the registration error even though no app
    // (and so no `error_page:hints` filter) exists at boot.
    expect(html).toContain('data-testid="plumix-dev-error-hints"');
    expect(html).toMatch(/theme registration/i);
  });

  test("renders any thrown value, with no hint card when unrecognized", async () => {
    const html = await renderDevBootErrorResponse(
      new TypeError("cannot read properties of undefined (reading 'theme')"),
    ).text();

    expect(html).toContain("TypeError");
    // Nothing recognized the error, so the page degrades to just the exception
    // and stack — no hint region.
    expect(html).not.toContain('data-testid="plumix-dev-error-hints"');
  });
});
