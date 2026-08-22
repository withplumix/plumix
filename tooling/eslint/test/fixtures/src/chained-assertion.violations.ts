interface Wire {
  readonly id: number;
}

export function fromStorage(raw: Record<string, unknown>): Wire {
  return raw as unknown as Wire;
}

export function marked(raw: Record<string, unknown>): Wire {
  // Safety: yes.
  const wire = raw as unknown as Wire;
  return wire;
}

export function described(raw: Record<string, unknown>): Wire {
  // Storage hands back an open bag and the caller wants a Wire, so the shape
  // is converted here rather than at every call site.
  const wire = raw as unknown as Wire;
  return wire;
}

export function detached(raw: Record<string, unknown>): Wire {
  // Safety: the row is written by this module and read back in the same
  // transaction, so its shape cannot have drifted.

  const wire = raw as unknown as Wire;
  return wire;
}

export function trailing(raw: Record<string, unknown>): Wire {
  const bag = raw; // Safety: the row is written and read by this module alone.
  return bag as unknown as Wire;
}
