import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { DashboardWidgetManifestEntry } from "@plumix/core/manifest";

import { renderWithI18n } from "../../../test/render-with-i18n.js";
import {
  _resetPluginRegistry,
  registerPluginDashboardWidget,
} from "../../lib/plugin-registry.js";
import { DashboardWidgets } from "./-dashboard-widgets.js";

afterEach(() => {
  cleanup();
  _resetPluginRegistry();
});

const WIDGETS: readonly DashboardWidgetManifestEntry[] = [
  { id: "demo:hello", title: "Hello widget", component: "Hello" },
  { id: "demo:missing", title: "Not loaded", component: "Missing" },
];

function renderWidgets(widgets: readonly DashboardWidgetManifestEntry[]): void {
  renderWithI18n(<DashboardWidgets widgets={widgets} />);
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
