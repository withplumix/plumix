import type { ReactNode } from "react";

// Zero-JS GET search — submits to /search, which 301s the bare `?q=` to the
// path form. Shared by the desktop header and the mobile disclosure panel.
export function SearchForm({
  className,
}: {
  readonly className?: string;
}): ReactNode {
  return (
    <form action="/search" method="get" className={className}>
      <input
        name="q"
        placeholder="Search…"
        aria-label="Search"
        className="border-line w-full rounded border bg-transparent px-2 py-1 text-sm"
      />
    </form>
  );
}
