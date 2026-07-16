import { describe, expect, it } from "vitest";

import { assembleWrangler } from "./wrangler.js";

const BASE = `{
  // keep this comment
  "name": "__PROJECT_NAME__",
  "d1_databases": [{ "binding": "DB", "database_name": "__PROJECT_NAME__" }]
}
`;

describe("assembleWrangler", () => {
  it("merges binding patches while preserving comments", () => {
    const out = assembleWrangler(
      BASE,
      {
        r2_buckets: [
          { binding: "MEDIA", bucket_name: "__PROJECT_NAME__-media" },
        ],
      },
      "my-app",
    );
    expect(out).toContain("// keep this comment");
    expect(out).toContain('"r2_buckets"');
    expect(out).toContain('"binding": "MEDIA"');
  });

  it("substitutes the project name in both base text and patches", () => {
    const out = assembleWrangler(
      BASE,
      { r2_buckets: [{ bucket_name: "__PROJECT_NAME__-media" }] },
      "my-app",
    );
    expect(out).toContain('"name": "my-app"');
    expect(out).toContain('"bucket_name": "my-app-media"');
    expect(out).not.toContain("__PROJECT_NAME__");
  });

  it("returns the base unchanged (project name aside) when there are no patches", () => {
    const out = assembleWrangler(BASE, {}, "my-app");
    expect(out).toContain('"name": "my-app"');
    expect(out).not.toContain("r2_buckets");
  });
});
