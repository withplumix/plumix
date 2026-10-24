import type { AppContext } from "../context/app-context.js";
import type { Label } from "../i18n/label.js";

export interface AdminSearchInput {
  readonly query: string;
  readonly limit: number;
}

export interface SearchResultItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly url?: string;
}

/**
 * One result group, e.g. "Posts", "Tags", "Users". `label` is a `Label`
 * (string | descriptor) the client resolves with `useLabel`. `priority`
 * orders groups in the palette (lower first).
 */
export interface SearchGroup {
  readonly key: string;
  readonly label: Label;
  readonly priority: number;
  readonly items: readonly SearchResultItem[];
}

/**
 * Answers the admin command palette. Providers sharing a group key fill it in
 * order, so an `early` provider leads core's and core fills the rest.
 */
export interface SearchProvider {
  /** Unique across core and every plugin; a duplicate fails boot. */
  readonly id: string;
  /** Unset runs after core's provider, `late` after every unset one. */
  readonly order?: "early" | "late";
  search(
    input: AdminSearchInput,
    ctx: AppContext,
  ): readonly SearchGroup[] | Promise<readonly SearchGroup[]>;
}

export interface RegisteredSearchProvider extends SearchProvider {
  /** `null` for core's own provider. */
  readonly registeredBy: string | null;
}
