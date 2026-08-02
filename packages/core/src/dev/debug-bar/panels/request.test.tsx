import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { DebugContext } from "../snapshot.js";
import { makeSnapshot } from "../snapshot-fixture.js";
import { requestPanel } from "./request.js";

function render(context: Partial<DebugContext>): string {
  return renderToStaticMarkup(
    <>{requestPanel.render(makeSnapshot({ context }))}</>,
  );
}

describe("requestPanel", () => {
  test("shows the request line", () => {
    const html = render({ method: "GET", path: "/blog/hello" });
    expect(html).toContain("GET");
    expect(html).toContain("/blog/hello");
  });

  test("shows the authenticated user and token scopes", () => {
    const html = render({
      user: { email: "a@b.c", role: "admin" },
      tokenScopes: ["read:posts"],
    });

    expect(html).toContain("a@b.c");
    expect(html).toContain("admin");
    expect(html).toContain("read:posts");
  });

  test("shows anonymous and unrestricted when there is no user or scope narrowing", () => {
    const html = render({});
    expect(html).toContain("anonymous");
    expect(html).toContain("unrestricted");
  });
});
