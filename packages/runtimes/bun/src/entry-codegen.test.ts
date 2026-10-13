import { describe, expect, test } from "vitest";

import { bun } from "./adapter.js";

describe("bun generateEntry", () => {
  // Bun serves a default-exported `Server` no second time, so a run entry
  // listens once, through `serveProcess`; an imported one starts nothing.
  test("default-exports the server serveProcess started when run directly, and the portable handler when imported", () => {
    const source = bun().generateEntry({ configModule: "./config.ts" });

    expect(source).toContain(
      "export default import.meta.main ? await serveProcess(site) : site.handler;",
    );
  });
});
