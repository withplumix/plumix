import type { BlockNode, BlockSpec } from "@plumix/blocks";

// A loader-backed block so the inspector's scoped-refresh control (#1120) has
// something to act on. The loader is a server function — it never runs in this
// backend-less harness, so the canvas opens with no data and the host's refresh
// stub pushes some in over the bridge. The render reflects whichever it has.
export const feedSpec: BlockSpec = {
  name: "playground/feed",
  inputs: [{ name: "title", type: "text", label: "Title" }],
  loaders: {
    items: () => Promise.resolve({ label: "from the server" }),
  },
  render: ({ attrs, loaders }) => {
    const items = loaders.items as { label?: string } | undefined;
    const title =
      typeof attrs.title === "string" ? attrs.title : "Latest posts";
    return (
      <div data-testid="feed-block" className="rounded border p-4">
        <strong>{title}</strong>{" "}
        <span data-testid="feed-data">{items?.label ?? "no data yet"}</span>
      </div>
    );
  },
};

export const FEED_SEED: BlockNode = {
  id: "feed-1",
  name: "playground/feed",
  attrs: { title: "Latest posts" },
};
