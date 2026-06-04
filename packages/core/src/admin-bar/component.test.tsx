import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "@plumix/blocks";
import { PlumixProvider } from "@plumix/blocks/renderer";

import type { AuthNamespace } from "../context/app.js";
import { HookRegistry } from "../hooks/registry.js";
import { PlumixAdminBar } from "./component.js";
import { registerCoreAdminBarContributors } from "./core-contributors.js";

const emptyRegistry = createBlockRegistry([]);

const user = {
  id: 7,
  email: "editor@cms.example",
  role: "editor",
  meta: {},
};

const request = new Request("https://cms.example/");
const auth: AuthNamespace = { can: () => true };

describe("PlumixAdminBar", () => {
  test("renders nothing when user is null", () => {
    const hooks = new HookRegistry();

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user: null }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
        />
      </PlumixProvider>,
    );

    expect(html).toBe("");
  });

  test("renders the bar shell when user is populated", () => {
    const hooks = new HookRegistry();

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar"');
  });

  test("renders core contributor nodes as anchors with stable testids", () => {
    const hooks = new HookRegistry();
    registerCoreAdminBarContributors(hooks);

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar
          hooks={hooks}
          request={request}
          siteName="My Site"
          auth={auth}
        />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar-node-site"');
    expect(html).toContain('href="/_plumix/admin"');
    expect(html).toContain("My Site");
    expect(html).toContain('data-testid="plumix-admin-bar-node-account"');
    expect(html).toContain("editor@cms.example");
  });
});
