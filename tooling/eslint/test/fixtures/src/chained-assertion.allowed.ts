interface Wire {
  readonly id: number;
}

interface Row {
  readonly id: number;
  readonly draft: boolean;
}

export function narrow(row: Row): Wire {
  // Safety: `Row` is a superset of `Wire` and both are built by this module,
  // so the conversion drops the `draft` key and nothing else.
  return row as unknown as Wire;
}

export function erase(row: Row): Wire {
  /*
   * Safety: the registry stores one homogenised row per kind, so every
   * reader recovers the per-kind type it registered under.
   */
  return row as unknown as Wire;
}

// An assertion that is not routed through `unknown` keeps whatever evidence
// the compiler had, so it is none of this rule's business.
export function widen(row: Row): Readonly<Record<string, number | boolean>> {
  return row as Readonly<Record<string, number | boolean>>;
}

// Widening to `unknown` on its own discards nothing the caller had — it is the
// correct input type for a parse boundary.
export function erased(row: Row): unknown {
  return row as unknown;
}

// `unknown` inside a wider assertion target describes a boundary rather than
// routes around one.
export function bag(row: Row): Readonly<Record<string, unknown>> {
  return row as Readonly<Record<string, unknown>>;
}
