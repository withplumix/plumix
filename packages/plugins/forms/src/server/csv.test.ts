import { describe, expect, test } from "vitest";

import { toCsv } from "./csv.js";

describe("toCsv", () => {
  test("separates cells with commas and rows with CRLF", () => {
    const csv = toCsv([
      ["Received", "Your name"],
      ["2026-01-01", "Ada"],
    ]);

    expect(csv).toContain("Received,Your name\r\n2026-01-01,Ada");
  });

  test("quotes a cell carrying a separator, a quote or a line break", () => {
    const csv = toCsv([["Wren, of 12 Bell St", 'She said "no"', "one\ntwo"]]);

    expect(csv).toContain('"Wren, of 12 Bell St","She said ""no""","one\ntwo"');
  });

  // The answer is a visitor's to write, and a spreadsheet reads a cell
  // that opens with one of these as something to run rather than to show.
  test("neutralises an answer a spreadsheet would run as a formula", () => {
    const csv = toCsv([
      ["=1+1", "+1 555 0100", "@SUM(A1)", "\tSUM(A1)", `-WEBSERVICE("x")`],
    ]);

    expect(csv).toContain(
      `'=1+1,'+1 555 0100,'@SUM(A1),'\tSUM(A1),"'-WEBSERVICE(""x"")"`,
    );
  });

  // A `number` field stores a number, and one below zero opens with the
  // same character a formula does. Neutralising it would file the answer
  // as text and lose every sum the column was exported for.
  test("leaves a negative number a number", () => {
    expect(toCsv([["-12.5", "-3"]])).toContain("-12.5,-3");
  });

  test("opens with a byte order mark, so a spreadsheet reads UTF-8", () => {
    expect(toCsv([["Grüße"]])).toBe("\uFEFFGrüße");
  });
});
