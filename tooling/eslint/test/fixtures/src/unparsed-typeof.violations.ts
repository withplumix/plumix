interface StoredRow {
  readonly key: string;
  readonly value: unknown;
}

export function readFlag(row: StoredRow): boolean {
  return typeof row.value === "boolean" ? row.value : false;
}

export function readSalt(row: StoredRow | undefined): string | null {
  return typeof row?.value === "string" ? row.value : null;
}

export function readKeyed(row: StoredRow): number {
  return typeof row["value"] === "number" ? row["value"] : 0;
}

export function readTitle(row: StoredRow): string {
  // Not parsed: legacy.
  return typeof row.value === "string" ? row.value : "";
}

export function describeValue(row: StoredRow): string {
  const tag = typeof row.value;
  return tag === "string" ? "text" : tag;
}

// The motivating case: a field read off a value that is `any`, where nothing
// even declared the field this check tests.
export function readVersion(raw: string): string | null {
  const pkg = JSON.parse(raw);
  return typeof pkg.version === "string" ? pkg.version : null;
}

// A shape with a leftovers slot, which is what a loose-object schema infers.
// Its declared half does not vouch for its undecoded half.
type LooseNode = { readonly type: string } & {
  readonly [key: string]: unknown;
};

export function readAttrs(node: LooseNode): boolean {
  return typeof node.attrs === "object";
}

// The anchor is the innermost statement, so a note above an outer one does not
// reach a check that sits in a statement of its own.
export function readEach(rows: readonly StoredRow[]): string[] {
  // Not parsed: anchored on the return, which is not where the check below
  // lives — the callback's own statement is.
  return rows.map((row) => {
    return typeof row.value === "string" ? row.value : "";
  });
}
