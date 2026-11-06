import { describe, expect, test } from "vitest";

import { authorizeUrl } from "./-authorize-url.js";

describe("the authorization endpoint the consent page sends a covered request back to", () => {
  test("carries the request the client sent, without the parameters it left out", () => {
    const url = authorizeUrl("", {
      client_id: "https://agent.example/client.json",
      scope: "draft",
      state: undefined,
    });

    expect(url).toBe(
      "/_plumix/oauth/authorize?client_id=https%3A%2F%2Fagent.example%2Fclient.json&scope=draft",
    );
  });

  test("is mounted under the site's base path", () => {
    expect(authorizeUrl("/blog", { scope: "read" })).toBe(
      "/blog/_plumix/oauth/authorize?scope=read",
    );
  });
});
