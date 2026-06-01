import { i18n, setupI18n } from "@lingui/core";
import { describe, expect, test } from "vitest";

import { resolveLabel } from "./label.js";

describe("resolveLabel", () => {
  test("returns plain strings unchanged", () => {
    expect(resolveLabel("Pages", i18n)).toBe("Pages");
  });

  test("resolves a MessageDescriptor against the active catalog", () => {
    const instance = setupI18n({
      locale: "de",
      messages: { de: { "page.label": "Seiten" } },
    });
    expect(resolveLabel({ id: "page.label", message: "Pages" }, instance)).toBe(
      "Seiten",
    );
  });

  test("falls back to descriptor.message when the catalog has no translation", () => {
    const instance = setupI18n({ locale: "de", messages: { de: {} } });
    expect(resolveLabel({ id: "page.label", message: "Pages" }, instance)).toBe(
      "Pages",
    );
  });
});
