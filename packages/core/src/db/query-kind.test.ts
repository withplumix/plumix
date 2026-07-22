import { describe, expect, test } from "vitest";

import { queryKind } from "./query-kind.js";

describe("queryKind", () => {
  test("detects the leading statement kind", () => {
    expect(queryKind("  SELECT 1")).toBe("select");
    expect(queryKind("insert into t values (1)")).toBe("insert");
    expect(queryKind("UPDATE t SET x = 1")).toBe("update");
    expect(queryKind("delete from t")).toBe("delete");
    expect(queryKind("pragma foreign_keys")).toBe("other");
  });
});
