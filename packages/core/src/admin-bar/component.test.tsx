import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "@plumix/blocks";
import { PlumixProvider } from "@plumix/blocks/renderer";

import { HookRegistry } from "../hooks/registry.js";
import { PlumixAdminBar } from "./component.js";

const emptyRegistry = createBlockRegistry([]);

const user = {
  id: 7,
  email: "editor@cms.example",
  role: "editor",
  meta: {},
};

const request = new Request("https://cms.example/");

describe("PlumixAdminBar", () => {
  test("renders nothing when user is null", () => {
    const hooks = new HookRegistry();

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user: null }}>
        <PlumixAdminBar hooks={hooks} request={request} />
      </PlumixProvider>,
    );

    expect(html).toBe("");
  });

  test("renders a <header data-testid='plumix-admin-bar'> when user is populated", () => {
    const hooks = new HookRegistry();

    const html = renderToStaticMarkup(
      <PlumixProvider value={{ registry: emptyRegistry, user }}>
        <PlumixAdminBar hooks={hooks} request={request} />
      </PlumixProvider>,
    );

    expect(html).toContain('data-testid="plumix-admin-bar"');
  });
});
