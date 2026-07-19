import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { AppContext } from "../../context/app.js";
import { requestPanel } from "./request.js";

function ctxWith(overrides: Partial<AppContext>): AppContext {
  return {
    request: new Request("https://cms.example/blog/hello"),
    resolvedEntity: null,
    origin: "https://cms.example",
    basePath: "",
    user: null,
    tokenScopes: null,
    ...overrides,
  } as unknown as AppContext;
}

describe("requestPanel", () => {
  test("shows the request line", () => {
    const html = renderToStaticMarkup(<>{requestPanel.render(ctxWith({}))}</>);
    expect(html).toContain("GET");
    expect(html).toContain("/blog/hello");
  });

  test("shows the authenticated user and token scopes", () => {
    const ctx = ctxWith({
      user: { id: 1, email: "a@b.c", role: "admin", meta: {} },
      tokenScopes: ["read:posts"],
    });

    const html = renderToStaticMarkup(<>{requestPanel.render(ctx)}</>);

    expect(html).toContain("a@b.c");
    expect(html).toContain("admin");
    expect(html).toContain("read:posts");
  });

  test("shows anonymous and unrestricted when there is no user or scope narrowing", () => {
    const html = renderToStaticMarkup(<>{requestPanel.render(ctxWith({}))}</>);
    expect(html).toContain("anonymous");
    expect(html).toContain("unrestricted");
  });
});
