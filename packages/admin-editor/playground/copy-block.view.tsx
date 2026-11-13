import type { ReactNode } from "react";

import type { BlockViewProps, LoadedDeps } from "@plumix/core/blocks";

export const deps = (attrs: { readonly group?: unknown }) => ({
  settings: [String(attrs.group)],
});

export default function CopyView({
  attrs,
  deps: loaded,
}: BlockViewProps): ReactNode {
  const bag = (loaded as LoadedDeps).settings?.[String(attrs.group)];
  const title = (bag as { readonly title?: string } | null | undefined)?.title;
  return (
    <p data-testid="copy-text" className="rounded border p-4">
      {title ?? "no copy"}
    </p>
  );
}
