import { setupI18n } from "@lingui/core";
import { describe, expect, test } from "vitest";

import { deviceLabel } from "./editor-toolbar.js";

const i18n = setupI18n({ locale: "en", messages: { en: {} } });

describe("deviceLabel", () => {
  test.each([
    ["desktop", "Desktop"],
    ["tablet", "Tablet"],
    ["mobile", "Mobile"],
  ] as const)("labels the %s device %s", (device, label) => {
    expect(deviceLabel(i18n, device)).toBe(label);
  });
});
