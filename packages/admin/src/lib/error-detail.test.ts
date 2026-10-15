import { describe, expect, test } from "vitest";

import { errorDetail } from "./error-detail.js";

describe("errorDetail", () => {
  test("shows a thrown Error's message", () => {
    expect(errorDetail(new Error("boom-message"))).toBe("boom-message");
  });

  test("shows a thrown non-Error value as the message", () => {
    expect(errorDetail("plain-string-throw")).toBe("plain-string-throw");
  });
});
