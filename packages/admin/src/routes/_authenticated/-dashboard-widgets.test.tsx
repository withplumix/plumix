import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { DashboardWidgetManifestEntry } from "@plumix/core/manifest";

import { messages as enMessages } from "../../../locales/en.mjs";
import {
  _resetPluginRegistry,
  registerPluginDashboardWidget,
} from "../../lib/plugin-registry.js";
import { DashboardWidgets } from "./-dashboard-widgets.js";

beforeAll(() => {
  i18n.load("en", enMessages);
  i18n.activate("en");
});

afterEach(() => {
  cleanup();
  _resetPluginRegistry();
});

const WIDGETS: readonly DashboardWidgetManifestEntry[] = [
  { id: "demo:hello", title: "Hello widget", component: "Hello" },
  { id: "demo:missing", title: "Not loaded", component: "Missing" },
];

function renderWidgets(widgets: readonly DashboardWidgetManifestEntry[]): void {
  render(
    <I18nProvider i18n={i18n}>
      <DashboardWidgets widgets={widgets} />
    </I18nProvider>,
  );
}

describe("DashboardWidgets", () => {
  test("renders a registered widget's component and title", () => {
    registerPluginDashboardWidget("demo:hello", () => <p>hi there</p>);
    renderWidgets(WIDGETS);
    const card = screen.getByTestId("dashboard-widget-demo:hello");
    expect(card).toHaveTextContent("Hello widget");
    expect(card).toHaveTextContent("hi there");
  });

  test("skips a widget whose component isn't registered", () => {
    registerPluginDashboardWidget("demo:hello", () => <p>hi</p>);
    renderWidgets(WIDGETS);
    expect(screen.queryByTestId("dashboard-widget-demo:missing")).toBeNull();
  });

  test("renders nothing when no widgets have a registered component", () => {
    renderWidgets(WIDGETS);
    expect(screen.queryByTestId("dashboard-widgets")).toBeNull();
  });

  test("shows a widget-scoped fallback when a widget throws", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    registerPluginDashboardWidget("demo:hello", () => {
      throw new Error("boom");
    });
    renderWidgets(WIDGETS);
    expect(screen.getByTestId("plugin-widget__error")).toBeVisible();
    consoleError.mockRestore();
  });
});
