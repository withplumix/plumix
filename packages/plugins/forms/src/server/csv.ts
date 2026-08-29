// What forces a cell into quotes: the separator, the row terminator, or
// the quote character itself — RFC 4180's list, and no more, so an
// ordinary answer stays as it was written.
const NEEDS_QUOTES = /["\r\n,]/;

/**
 * What a spreadsheet reads as the opening of a formula rather than as
 * text — Excel's and LibreOffice's list, tab and carriage return
 * included, since both are trimmed before the first character is judged.
 * An answer is a visitor's to write, so a cell opening with one of these
 * is prefixed with an apostrophe: the spreadsheet's own marker for "this
 * is text", which it consumes rather than displays.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * The one reading of a leading `-` that is not a formula: a `number`
 * field's answer below zero. Marking it as text would lose every sum the
 * column was exported for, and no spreadsheet evaluates a bare number.
 */
const NEGATIVE_NUMBER = /^-\d+(?:\.\d+)?$/;

function cell(value: string): string {
  const startsFormula =
    FORMULA_LEAD.test(value) && !NEGATIVE_NUMBER.test(value);
  const text = startsFormula ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * A byte order mark, because the file is opened in a spreadsheet before
 * it is parsed by anything else and Excel reads a mark-less file as the
 * machine's own code page — which turns every non-ASCII answer to
 * mojibake on the desktop the export was made for.
 */
const BOM = "\uFEFF";

/**
 * A table of text as one CSV document. The caller writes the header as
 * the first row; everything about how a cell survives the trip is here.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return BOM + rows.map((cells) => cells.map(cell).join(",")).join("\r\n");
}
