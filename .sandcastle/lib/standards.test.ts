import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { REPO_ROOT } from "./repo.js";
import { reviewChecklistIn } from "./standards.js";

describe("reviewChecklistIn", () => {
  test("hands over the checklist section alone, up to the next section", () => {
    const standards = [
      "# Coding standards",
      "## Readability",
      "Explicit code.",
      "## Review checklist",
      "1. No nested ternary.",
      "2. Tests sit in their tier.",
      "## Tests",
      "Three tiers.",
    ].join("\n");

    expect(reviewChecklistIn(standards)).toBe(
      "1. No nested ternary.\n2. Tests sit in their tier.",
    );
  });

  test("a standards file without the section fails loudly, so no prompt goes out without it", () => {
    expect(() => reviewChecklistIn("# Coding standards\n## Tests\n")).toThrow(
      "Review checklist",
    );
  });

  test("the repository's standards carry the checklist", () => {
    const standards = readFileSync(
      join(REPO_ROOT, "CODING_STANDARDS.md"),
      "utf8",
    );

    expect(reviewChecklistIn(standards)).toMatch(/^1\. /m);
  });
});
