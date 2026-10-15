import { describe, expect, test } from "vitest";

import { embedFrameAttributes } from "./frame-attrs.js";

describe("embedFrameAttributes", () => {
  test("strict-sandboxes an untrusted embed and sends it no referrer", () => {
    expect(embedFrameAttributes(true)).toEqual({
      sandbox: "allow-scripts",
      referrerPolicy: "no-referrer",
    });
  });

  test("leaves a safelisted provider unsandboxed", () => {
    expect(embedFrameAttributes(false)).toEqual({
      referrerPolicy: "strict-origin-when-cross-origin",
    });
  });
});
