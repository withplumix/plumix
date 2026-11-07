import type { ComponentProps } from "react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ConnectedAppsSection } from "./connected-apps.js";

const EXAMPLE_AGENT = {
  id: 7,
  name: "Example Agent",
  host: "agent.example",
  capabilities: ["entry:post:read", "entry:post:create"],
  lastUsedAt: null,
};

function render(
  overrides: Partial<ComponentProps<typeof ConnectedAppsSection>> = {},
): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>
      <ConnectedAppsSection
        apps={[EXAMPLE_AGENT]}
        isLoading={false}
        onRevoke={() => undefined}
        revokePending={false}
        {...overrides}
      />
    </I18nProvider>,
  );
}

describe("the connected apps section", () => {
  test("names each app and its host", () => {
    const html = render();

    expect(html).toContain("Example Agent");
    expect(html).toContain("agent.example");
  });

  test("lists the capabilities an app holds", () => {
    const html = render();

    expect(html).toContain(
      'data-testid="connected-apps-capability-entry:post:read"',
    );
    expect(html).toContain(
      'data-testid="connected-apps-capability-entry:post:create"',
    );
  });

  test("says an app holding no capability has no access", () => {
    const html = render({ apps: [{ ...EXAMPLE_AGENT, capabilities: [] }] });

    expect(html).toContain('data-testid="connected-apps-capability-none"');
  });

  test("says an app that never called the site was never used", () => {
    const html = render();

    expect(html).toMatch(
      /data-testid="connected-apps-last-used-7"[^>]*>Never</,
    );
  });

  test("offers to revoke each app", () => {
    const html = render();

    expect(html).toContain('data-testid="connected-apps-revoke-7"');
  });

  test("says when no app is connected", () => {
    const html = render({ apps: [] });

    expect(html).toContain('data-testid="connected-apps-empty"');
  });
});
