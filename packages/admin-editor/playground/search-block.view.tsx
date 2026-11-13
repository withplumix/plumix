import type { ReactNode } from "react";

export default function SearchView(): ReactNode {
  return (
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
  );
}
