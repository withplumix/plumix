import { describe, expect, test } from "vitest";

import { McpToolError, toToolErrorResult } from "./errors.js";

describe("toToolErrorResult", () => {
  test("maps a domain error to an isError envelope with a code-prefixed message", () => {
    const result = toToolErrorResult(
      McpToolError.notFound('unknown entry type: "nope"'),
    );

    expect(result).toEqual({
      isError: true,
      content: [
        { type: "text", text: 'not_found: unknown entry type: "nope"' },
      ],
    });
  });
});
