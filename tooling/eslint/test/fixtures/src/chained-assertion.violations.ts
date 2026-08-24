import type { OpenBag } from "./open-bag.js";

interface Wire {
  readonly id: number;
}

export function fromStorage(raw: OpenBag): Wire {
  return raw as unknown as Wire;
}

export function marked(raw: OpenBag): Wire {
  // Safety: yes.
  const wire = raw as unknown as Wire;
  return wire;
}

export function described(raw: OpenBag): Wire {
  // Storage hands back an open bag and the caller wants a Wire, so the shape
  // is converted here rather than at every call site.
  const wire = raw as unknown as Wire;
  return wire;
}

export function detached(raw: OpenBag): Wire {
  // Safety: the row is written by this module and read back in the same
  // transaction, so its shape cannot have drifted.

  const wire = raw as unknown as Wire;
  return wire;
}

export function trailing(raw: OpenBag): Wire {
  const bag = raw; // Safety: the row is written and read by this module alone.
  return bag as unknown as Wire;
}
