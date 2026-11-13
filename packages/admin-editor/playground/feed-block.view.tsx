import type { ReactNode } from "react";

import type { BlockViewProps, MaterializedAttrs } from "@plumix/core/blocks";

export const loaders = {
  items: () => Promise.resolve({ label: "from the server" }),
};

export default function FeedView({
  attrs,
  loaders: data,
}: BlockViewProps<MaterializedAttrs, typeof loaders>): ReactNode {
  // An empty bag until the host's refresh stub pushes data in.
  const items = data.items as { label?: string } | undefined;
  const title = typeof attrs.title === "string" ? attrs.title : "Latest posts";
  return (
    <div data-testid="feed-block" className="rounded border p-4">
      <strong>{title}</strong>{" "}
      <span data-testid="feed-data">{items?.label ?? "no data yet"}</span>
    </div>
  );
}
