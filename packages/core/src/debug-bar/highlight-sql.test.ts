import { describe, expect, test } from "vitest";

import { queryKind, tokenizeSql } from "./highlight-sql.js";

describe("tokenizeSql", () => {
  test("classifies keywords, strings, and numbers", () => {
    const tokens = tokenizeSql(
      "select * from users where id = 5 and name = 'ann'",
    );
    const keywords = tokens
      .filter((t) => t.kind === "keyword")
      .map((t) => t.text.toLowerCase());

    expect(keywords).toEqual(["select", "from", "where", "and"]);
    expect(tokens.find((t) => t.kind === "number")?.text).toBe("5");
    expect(tokens.find((t) => t.kind === "string")?.text).toBe("'ann'");
  });

  test("is lossless — joining token text reproduces the input", () => {
    for (const sql of [
      "insert into t (id, name) values (?, ?)",
      "select 'a''b' from t where x = ?", // escaped quote inside a string
      "select 'unterminated from t", // a stray single quote
    ]) {
      expect(
        tokenizeSql(sql)
          .map((t) => t.text)
          .join(""),
      ).toBe(sql);
    }
  });
});

describe("queryKind", () => {
  test("detects the leading statement kind", () => {
    expect(queryKind("  SELECT 1")).toBe("select");
    expect(queryKind("insert into t values (1)")).toBe("insert");
    expect(queryKind("UPDATE t SET x = 1")).toBe("update");
    expect(queryKind("delete from t")).toBe("delete");
    expect(queryKind("pragma foreign_keys")).toBe("other");
  });
});
