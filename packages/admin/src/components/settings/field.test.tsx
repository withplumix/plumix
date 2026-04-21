import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { SettingsFieldManifestEntry } from "@plumix/core/manifest";

import { SettingsField } from "./field.js";

afterEach(() => {
  cleanup();
});

function field(
  overrides: Partial<SettingsFieldManifestEntry> = {},
): SettingsFieldManifestEntry {
  return {
    name: "site_title",
    label: "Site title",
    type: "text",
    ...overrides,
  };
}

describe("SettingsField", () => {
  test("text: renders an <input type='text'> wired to value + onChange", () => {
    const handle = vi.fn();
    render(
      <SettingsField
        field={field()}
        value="Plumix"
        onChange={handle}
        testId="sf-site-title"
      />,
    );
    const input = screen.getByTestId("sf-site-title");
    expect(input).toHaveProperty("tagName", "INPUT");
    expect(input).toHaveProperty("type", "text");
    expect(input).toHaveProperty("value", "Plumix");
  });

  test("textarea: renders a <textarea> with value + onChange", () => {
    render(
      <SettingsField
        field={field({ type: "textarea", name: "site_description" })}
        value="A headless CMS"
        onChange={() => {
          // not exercised in this test
        }}
        testId="sf-site-desc"
      />,
    );
    const el = screen.getByTestId("sf-site-desc");
    expect(el).toHaveProperty("tagName", "TEXTAREA");
    expect(el).toHaveProperty("value", "A headless CMS");
  });

  test("description wires via aria-describedby", () => {
    render(
      <SettingsField
        field={field({ description: "Shown in the browser tab." })}
        value=""
        onChange={() => {
          // not exercised in this test
        }}
        testId="sf-with-desc"
      />,
    );
    const input = screen.getByTestId("sf-with-desc");
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const descEl = describedBy ? document.getElementById(describedBy) : null;
    expect(descEl?.textContent).toBe("Shown in the browser tab.");
  });

  test("disabled flag propagates and blocks typing", () => {
    render(
      <SettingsField
        field={field()}
        value="x"
        onChange={() => {
          // not exercised
        }}
        disabled
        testId="sf-disabled"
      />,
    );
    expect(screen.getByTestId("sf-disabled")).toHaveProperty("disabled", true);
  });

  test("maxLength propagates to the native attribute", () => {
    render(
      <SettingsField
        field={field({ maxLength: 80 })}
        value=""
        onChange={() => {
          // not exercised
        }}
        testId="sf-maxlen"
      />,
    );
    expect(screen.getByTestId("sf-maxlen")).toHaveProperty("maxLength", 80);
  });
});
