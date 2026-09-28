import { cleanup, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PlumixManifest } from "@plumix/core/manifest";

import { renderWithI18n } from "../../test/render-with-i18n.js";
import { LoginLocaleSwitcher } from "./login-locale-switcher.js";

afterEach(() => cleanup());

const enOnlyManifest: PlumixManifest = {
  i18n: {
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English", direction: "ltr", enabled: true },
    ],
  },
};

const enUkManifest: PlumixManifest = {
  i18n: {
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English", direction: "ltr", enabled: true },
      { code: "uk", label: "Українська", direction: "ltr", enabled: true },
    ],
  },
};

describe("LoginLocaleSwitcher", () => {
  test("renders nothing when only one locale is enabled", () => {
    // Single-locale installs don't need a switcher; rendering one would
    // be visual noise on the login form.
    const { container } = renderWithI18n(
      <LoginLocaleSwitcher
        currentCode="en"
        manifest={enOnlyManifest}
        onSelect={() => undefined}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("login-locale-switcher-trigger")).toBeNull();
  });

  test("renders a trigger labelled with the current locale", () => {
    renderWithI18n(
      <LoginLocaleSwitcher
        currentCode="uk"
        manifest={enUkManifest}
        onSelect={() => undefined}
      />,
    );
    const trigger = screen.getByTestId("login-locale-switcher-trigger");
    expect(trigger.textContent).toContain("Українська");
  });

  test("calls onSelect with the chosen locale code when the user picks an option", async () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <LoginLocaleSwitcher
        currentCode="en"
        manifest={enUkManifest}
        onSelect={onSelect}
      />,
    );
    await userEvent.click(screen.getByTestId("login-locale-switcher-trigger"));
    await userEvent.click(
      screen.getByTestId("login-locale-switcher-option-uk"),
    );
    expect(onSelect).toHaveBeenCalledWith("uk");
  });
});
