import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PlumixManifest } from "@plumix/core/manifest";

import { LocaleSwitcher } from "./locale-switcher.js";

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

describe("LocaleSwitcher", () => {
  test("renders the trigger with the current locale's label", () => {
    render(
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
    render(
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
