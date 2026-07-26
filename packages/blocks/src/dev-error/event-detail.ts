// Shared reader for the island-error CustomEvent detail. Both consumers of the
// same `plumix:island-error` / `plumix:hydration-error` signal — the island
// error overlay (#1603) and the terminal forwarder (#1604) — read it through
// here, so the `component-export` attribute name and the detail shape live in
// one place and can't drift.

export interface ErrorDetail {
  readonly error?: unknown;
  readonly element?: HTMLElement;
  readonly componentStack?: string;
}

export function detailOf(event: Event): ErrorDetail {
  const detail = (event as CustomEvent<unknown>).detail;
  return detail !== null && typeof detail === "object" ? detail : {};
}

/** The island's component name as `<Name>`, from its `component-export` attr. */
export function deriveLabel(element?: HTMLElement): string | undefined {
  const name = element?.getAttribute("component-export");
  return name ? `<${name}>` : undefined;
}
