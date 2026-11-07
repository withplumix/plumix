import { describe, expect, test } from "vitest";

import { definePlugin } from "../../src/plugin/define.js";
import { testSite } from "../../src/test/site.js";

const bare = await testSite({ plugins: [] });

const samlMicrosoft = definePlugin("saml-microsoft", {
  setup: (ctx) => {
    ctx.registerLoginLink({
      key: "default",
      label: "Sign in with Microsoft",
      href: "/_plumix/saml-microsoft/start",
    });
  },
});

const site = await testSite({ plugins: [samlMicrosoft] });

describe("the login links", () => {
  test("are empty on a site whose plugins register none", async () => {
    const links = await bare.rpc.auth.loginLinks({});

    expect(links).toEqual([]);
  });

  test("hold a plugin's link under an id namespaced by the plugin", async () => {
    const links = await site.rpc.auth.loginLinks({});

    expect(links).toEqual([
      {
        id: "saml-microsoft:default",
        label: "Sign in with Microsoft",
        href: "/_plumix/saml-microsoft/start",
      },
    ]);
  });
});
