import {
  _resetPluginRegistry,
  registerPluginDashboardWidget,
} from "@/lib/plugin-registry.js";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, test } from "vitest";

import { DashboardWidgets } from "./-dashboard-widgets.js";

afterEach(() => {
  _resetPluginRegistry();
});

test("renders a registered widget's component under its title", () => {
  registerPluginDashboardWidget("demo:hello", () => <p>hi there</p>);

  const html = renderToStaticMarkup(
    <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>
      <DashboardWidgets
        widgets={[
          { id: "demo:hello", title: "Hello widget", component: "Hello" },
        ]}
      />
    </I18nProvider>,
  );

  expect(html).toContain('data-testid="dashboard-widget-demo:hello"');
  expect(html).toContain("Hello widget");
  expect(html).toContain("<p>hi there</p>");
});
