import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { PlumixManifest } from "@plumix/core/manifest";

import { LocaleSwitcher } from "./locale-switcher.js";

beforeEach(() => {
  i18n.load({ en: {} });
  i18n.activate("en");
});

afterEach(() => cleanup());

const enArManifest: PlumixManifest = {
  i18n: {
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English", direction: "ltr", enabled: true },
      { code: "ar", label: "العربية", direction: "rtl", enabled: true },
    ],
  },
};

function renderInProvider(node: React.ReactNode) {
  return render(<I18nProvider i18n={i18n}>{node}</I18nProvider>);
}

describe("LocaleSwitcher", () => {
  test("renders the trigger with the current locale's label", () => {
    renderInProvider(
      <LocaleSwitcher
        currentCode="ar"
        manifest={enArManifest}
        onSelect={() => undefined}
      />,
    );
    const trigger = screen.getByTestId("locale-switcher-trigger");
    expect(trigger.textContent).toContain("العربية");
  });

  test("calls onSelect with the chosen locale code when the user picks an option", async () => {
    const onSelect = vi.fn();
    renderInProvider(
      <LocaleSwitcher
        currentCode="en"
        manifest={enArManifest}
        onSelect={onSelect}
      />,
    );

    await userEvent.click(screen.getByTestId("locale-switcher-trigger"));
    await userEvent.click(screen.getByTestId("locale-switcher-option-ar"));

    expect(onSelect).toHaveBeenCalledWith("ar");
  });
});
