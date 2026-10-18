import { describe, expect, test } from "vitest";

import { DumpLineError, parseDumpLine, sqlLiteral } from "./sync-sql.js";

describe("parseDumpLine", () => {
  test("reads a row D1's dump writes, a line break and a quote in a string included", () => {
    expect(
      parseDumpLine(
        `INSERT INTO "b" ("id","v","s","r","n") VALUES(1,X'0102ff',replace(replace('it''s\\nnew; x\\r\\nCOMMIT;','\\r',char(13)),'\\n',char(10)),1.5,NULL);`,
      ),
    ).toEqual({
      table: "b",
      row: {
        id: 1,
        v: new Uint8Array([1, 2, 255]),
        s: "it's\nnew; x\r\nCOMMIT;",
        r: 1.5,
        n: null,
      },
    });
  });

  test("reads an empty string, an empty BLOB, a negative and an exponent", () => {
    expect(
      parseDumpLine(
        `INSERT INTO "b" ("s","v","r","n") VALUES('',X'',-0.25,1e+300);`,
      )?.row,
    ).toEqual({ s: "", v: new Uint8Array([]), r: -0.25, n: 1e300 });
  });

  test("reads a quoted identifier with a doubled quote in it", () => {
    expect(
      parseDumpLine(`INSERT INTO "odd""name" ("a""b") VALUES('ü😀');`),
    ).toEqual({ table: 'odd"name', row: { 'a"b': "ü😀" } });
  });

  test("reads a BLOB of several bytes in order", () => {
    expect(
      parseDumpLine(`INSERT INTO "b" ("v") VALUES(X'00ab10');`)?.row,
    ).toEqual({ v: new Uint8Array([0, 171, 16]) });
  });

  test("refuses a replace() that is not one of the dump's line-break spellings", () => {
    expect(() =>
      parseDumpLine(
        `INSERT INTO "b" ("s") VALUES(replace('a\\nb','\\n',char(13)));`,
      ),
    ).toThrow(DumpLineError);
  });

  test("skips a line that inserts nothing", () => {
    expect(parseDumpLine("PRAGMA defer_foreign_keys=TRUE;")).toBeNull();
  });

  test("refuses a row whose values do not match its columns", () => {
    expect(() => parseDumpLine(`INSERT INTO "b" ("a","b") VALUES(1);`)).toThrow(
      DumpLineError,
    );
  });
});

describe("sqlLiteral", () => {
  test("spells a line break with char(), so a script keeps one statement per line", () => {
    expect(sqlLiteral("it's\nnew\\n\r")).toBe(
      "'it''s'||char(10)||'new\\n'||char(13)||''",
    );
  });

  test("spells an infinity as D1's dump does", () => {
    expect([sqlLiteral(Infinity), sqlLiteral(-Infinity)]).toEqual([
      "9e999",
      "-9e999",
    ]);
  });

  test("spells a BLOB in hex and NULL as NULL", () => {
    expect([sqlLiteral(new Uint8Array([0, 171])), sqlLiteral(null)]).toEqual([
      "X'00ab'",
      "NULL",
    ]);
  });
});
