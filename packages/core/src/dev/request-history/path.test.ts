import { describe, expect, test } from "vitest";

import { DEBUG_REQUESTS_PATH, isDebugRequestsPath } from "./path.js";

describe("isDebugRequestsPath", () => {
  test("matches the collection and any detail path", () => {
    expect(isDebugRequestsPath(DEBUG_REQUESTS_PATH)).toBe(true);
    expect(isDebugRequestsPath(`${DEBUG_REQUESTS_PATH}/req-1`)).toBe(true);
  });

  test("does not match a sibling path", () => {
    expect(isDebugRequestsPath("/_plumix/debug/requestsx")).toBe(false);
    expect(isDebugRequestsPath("/_plumix/rpc/entry/list")).toBe(false);
  });
});
