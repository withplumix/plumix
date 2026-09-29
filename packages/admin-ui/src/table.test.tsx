import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TableCell, TableHead } from "./table.js";

function classesOf(markup: string): string[] {
  const escaped = /class="([^"]*)"/.exec(markup)?.[1] ?? "";
  return escaped.replaceAll("&gt;", ">").replaceAll("&amp;", "&").split(" ");
}

describe("TableHead and TableCell", () => {
  it("end-align a column marked `data-align=end` and narrow a checkbox column", () => {
    for (const markup of [
      renderToStaticMarkup(<TableHead data-align="end" />),
      renderToStaticMarkup(<TableCell data-align="end" />),
    ]) {
      expect(classesOf(markup)).toEqual(
        expect.arrayContaining([
          "data-[align=end]:text-end",
          "[&:has([role=checkbox])]:w-8",
        ]),
      );
    }
  });
});
