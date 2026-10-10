/** RFC 4180's list and no more, so ordinary answers stay unquoted. */
const NEEDS_QUOTES = /["\r\n,]/;

/**
 * Excel's and LibreOffice's formula leads; tab and CR count because both
 * are trimmed before the first character is judged.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * Not escaped: marking it as text would break sums, and a bare number
 * isn't evaluated.
 */
const NEGATIVE_NUMBER = /^-\d+(?:\.\d+)?$/;

function cell(value: string): string {
  const startsFormula =
    FORMULA_LEAD.test(value) && !NEGATIVE_NUMBER.test(value);
  const text = startsFormula ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Excel reads a file without a BOM in the machine's code page, garbling
 * non-ASCII answers.
 */
const BOM = "\uFEFF";

/**
 * A table of text as one CSV document. The caller writes the header as
 * the first row; everything about how a cell survives the trip is here.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return BOM + rows.map((cells) => cells.map(cell).join(",")).join("\r\n");
}
