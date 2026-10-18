import type { SyncRow, SyncValue } from "plumix/cli";

export function ident(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * `D1Database.exec` and D1's import split a script into statements by line,
 * so a line break is `char()`. Not D1's `replace(…,'\n',char(10))`, which
 * also turns a literal backslash-n into one.
 */
function stringLiteral(value: string): string {
  return value
    .split(/(\r|\n)/)
    .map((part) => {
      if (part === "\n") return "char(10)";
      if (part === "\r") return "char(13)";
      return `'${part.replaceAll("'", "''")}'`;
    })
    .join("||");
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function fromHex(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function numberLiteral(value: number): string {
  if (Number.isFinite(value)) return String(value);
  return value > 0 ? "9e999" : "-9e999";
}

export function sqlLiteral(value: SyncValue): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return numberLiteral(value);
  if (typeof value === "string") return stringLiteral(value);
  return `X'${hex(value)}'`;
}

/** Each column's SQL, a literal or an expression the caller wrote. */
export function insertLine(
  table: string,
  values: Readonly<Record<string, string>>,
): string {
  const columns = Object.keys(values);
  return `INSERT INTO ${ident(table)} (${columns.map(ident).join(",")}) VALUES(${columns.map((column) => values[column]).join(",")});`;
}

export function rowLiterals(row: SyncRow): Record<string, string> {
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [column, sqlLiteral(value)]),
  );
}

/** A dump line is not one this reader understands. */
export class DumpLineError extends Error {
  constructor(line: string, detail: string) {
    super(`${detail}: ${line.length > 120 ? `${line.slice(0, 120)}…` : line}`);
    this.name = "DumpLineError";
  }
}

class Cursor {
  position = 0;

  constructor(readonly line: string) {}

  fail(detail: string): never {
    throw new DumpLineError(this.line, detail);
  }

  skipSpace(): void {
    while (this.line[this.position] === " ") this.position += 1;
  }

  take(text: string): boolean {
    this.skipSpace();
    if (!this.line.startsWith(text, this.position)) return false;
    this.position += text.length;
    return true;
  }

  expect(text: string): void {
    if (!this.take(text)) this.fail(`expected ${text}`);
  }

  quoted(quote: "'" | '"'): string {
    this.expect(quote);
    let text = "";
    for (;;) {
      const end = this.line.indexOf(quote, this.position);
      if (end === -1) this.fail("an unterminated quote");
      text += this.line.slice(this.position, end);
      this.position = end + 1;
      if (this.line[this.position] !== quote) return text;
      text += quote;
      this.position += 1;
    }
  }

  number(): number {
    this.skipSpace();
    const match = /^-?[0-9][0-9.eE+-]*/.exec(this.line.slice(this.position));
    if (match === null) this.fail("expected a value");
    this.position += match[0].length;
    return Number(match[0]);
  }
}

const ESCAPED_CHARACTERS: Readonly<Record<string, string>> = {
  "\\n": "\n",
  "\\r": "\r",
};

/** `replace(<value>,'\n',char(10))`, as the dump spells a line break. */
function replaced(cursor: Cursor): string {
  const inner = value(cursor);
  if (typeof inner !== "string") cursor.fail("replace() of a non-string");
  cursor.expect(",");
  const escape = cursor.quoted("'");
  cursor.expect(",char(");
  const code = cursor.number();
  cursor.expect(")");
  cursor.expect(")");
  if (ESCAPED_CHARACTERS[escape] !== String.fromCharCode(code)) {
    cursor.fail("a replace() the dump never writes");
  }
  return inner.replaceAll(escape, String.fromCharCode(code));
}

function value(cursor: Cursor): SyncValue {
  cursor.skipSpace();
  if (cursor.take("NULL")) return null;
  if (cursor.take("replace(")) return replaced(cursor);
  if (cursor.take("X'")) {
    cursor.position -= 1;
    return fromHex(cursor.quoted("'"));
  }
  if (cursor.line[cursor.position] === "'") return cursor.quoted("'");
  return cursor.number();
}

function list<T>(cursor: Cursor, item: () => T): T[] {
  cursor.expect("(");
  const items = [item()];
  while (cursor.take(",")) items.push(item());
  cursor.expect(")");
  return items;
}

/**
 * The table and row of an `INSERT` line of `wrangler d1 export`'s dump;
 * `null` for any other statement.
 */
export function parseDumpLine(
  line: string,
): { readonly table: string; readonly row: SyncRow } | null {
  const cursor = new Cursor(line);
  if (!cursor.take("INSERT INTO ")) return null;
  const table = cursor.quoted('"');
  const columns = list(cursor, () => cursor.quoted('"'));
  cursor.expect("VALUES");
  const values = list(cursor, () => value(cursor));
  cursor.expect(";");
  if (values.length !== columns.length) {
    cursor.fail("a row whose values do not match its columns");
  }
  return {
    table,
    // The lengths match, so every column has its value.
    row: Object.fromEntries(
      columns.map((column, i) => [column, values[i] as SyncValue]),
    ),
  };
}
