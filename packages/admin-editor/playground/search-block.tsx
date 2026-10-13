import type { BlockNode, BlockSpec } from "@plumix/core/blocks";

/** A theme's live form, which the canvas must keep from navigating the frame. */
export const searchSpec: BlockSpec = {
  name: "playground/search",
  render: () => (
    <form
      data-testid="search-form"
      action="./search-results.html"
      className="flex gap-2 rounded border p-4"
    >
      <input name="q" defaultValue="plumix" className="rounded border px-2" />
      <button
        type="submit"
        data-testid="search-submit"
        className="rounded border px-2"
      >
        Search
      </button>
    </form>
  ),
};

export const SEARCH_SEED: BlockNode = {
  id: "search-1",
  name: "playground/search",
};
