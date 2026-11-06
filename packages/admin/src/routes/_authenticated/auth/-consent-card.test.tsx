import type { ComponentProps } from "react";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { ConsentCard } from "./-consent-card.js";

function render(
  overrides: Partial<ComponentProps<typeof ConsentCard>> = {},
): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={setupI18n({ locale: "en", messages: { en: {} } })}>
      <ConsentCard
        client={{
          name: "Example Agent",
          host: "agent.example",
          logoUri: null,
          loopbackOnly: false,
        }}
        scope="draft"
        capabilities={["entry:post:read", "entry:post:create"]}
        kept={new Set(["entry:post:read"])}
        pending={false}
        failed={false}
        onToggle={() => undefined}
        onApprove={() => undefined}
        onDeny={() => undefined}
        {...overrides}
      />
    </I18nProvider>,
  );
}

describe("the consent card", () => {
  test("names the client and its host", () => {
    const html = render();

    expect(html).toContain("Example Agent");
    expect(html).toContain("agent.example");
  });

  test("warns when every redirect goes to the person's own machine", () => {
    const warned = render({
      client: {
        name: "Local Agent",
        host: "agent.example",
        logoUri: null,
        loopbackOnly: true,
      },
    });

    expect(warned).toContain('data-testid="oauth-consent-loopback-warning"');
    expect(render()).not.toContain("oauth-consent-loopback-warning");
  });

  test("offers each capability of the scope, checked while it is kept", () => {
    const html = render();

    expect(html).toMatch(
      /data-testid="oauth-consent-capability-entry:post:read"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-testid="oauth-consent-capability-entry:post:read"/,
    );
    expect(html).toMatch(
      /data-testid="oauth-consent-capability-entry:post:create"[^>]*aria-checked="false"|aria-checked="false"[^>]*data-testid="oauth-consent-capability-entry:post:create"/,
    );
  });

  test("shows the client's logo only from an https URL", () => {
    const client = {
      name: "Example Agent",
      host: "agent.example",
      loopbackOnly: false,
    };

    expect(
      render({ client: { ...client, logoUri: "https://agent.example/l.png" } }),
    ).toContain('src="https://agent.example/l.png"');
    expect(
      render({ client: { ...client, logoUri: "http://agent.example/l.png" } }),
    ).not.toContain("<img");
  });
});
