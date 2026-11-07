import { describe, expect, test } from "vitest";

import { testSite } from "../../src/test/site.js";
import { blog } from "../support/mcp-client.js";

const site = await testSite({
  plugins: [blog],
  config: { mcp: { enabled: true } },
});
const underBlog = await testSite({
  plugins: [blog],
  config: { mcp: { enabled: true }, basePath: "/blog" },
});
const withoutMcp = await testSite({ plugins: [] });

describe("the authorization-server metadata", () => {
  test("advertises the endpoints, the refresh grant, CIMD, public clients, S256 and the three scopes", async () => {
    const page = await site.visit(
      "https://cms.example/.well-known/oauth-authorization-server",
    );

    page.assertOk();
    expect(JSON.parse(page.body)).toEqual({
      issuer: "https://cms.example",
      authorization_endpoint: "https://cms.example/_plumix/oauth/authorize",
      token_endpoint: "https://cms.example/_plumix/oauth/token",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["read", "draft", "full"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  test.each([
    "https://cms.example/.well-known/oauth-authorization-server/blog",
    "https://cms.example/.well-known/oauth-authorization-server",
  ])("under a base path, %s names the mounted issuer", async (url) => {
    const page = await underBlog.visit(url);

    page.assertOk();
    expect(JSON.parse(page.body)).toMatchObject({
      issuer: "https://cms.example/blog",
      authorization_endpoint:
        "https://cms.example/blog/_plumix/oauth/authorize",
      token_endpoint: "https://cms.example/blog/_plumix/oauth/token",
    });
  });

  test("is not advertised by a site with MCP off", async () => {
    const page = await withoutMcp.visit(
      "https://cms.example/.well-known/oauth-authorization-server",
    );

    page.assertNotFound();
  });
});
