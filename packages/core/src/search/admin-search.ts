import type { AppContext } from "../context/app.js";
import type { HookExecutor } from "../hooks/registry.js";
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

declare module "../hooks/types.js" {
  interface FilterRegistry {
    // Producer set, run via `getFilterHandlers` — each handler is invoked
    // with the same input and returns its own groups (not a pipeline).
    "admin:search:results": (
      input: AdminSearchInput,
      ctx: AppContext,
    ) => readonly SearchGroup[] | Promise<readonly SearchGroup[]>;
  }
}

/**
 * Run every `admin:search:results` handler concurrently and merge their
 * groups. Each handler is isolated: a throwing or rejecting one degrades
 * to no contribution instead of breaking the palette. Empty groups are
 * dropped; the rest are ordered by `priority`.
 */
export async function runAdminSearch(
  hooks: Pick<HookExecutor, "getFilterHandlers">,
  input: AdminSearchInput,
  ctx: AppContext,
): Promise<readonly SearchGroup[]> {
  const produced = await Promise.all(
    hooks
      .getFilterHandlers("admin:search:results")
      .map(async ({ fn, plugin }) => {
        try {
          return await fn(input, ctx);
        } catch (error) {
          console.error(
            `[plumix] admin:search:results handler failed plugin=${plugin ?? "core"}`,
            error,
          );
          return [] as readonly SearchGroup[];
        }
      }),
  );
  return produced
    .flat()
    .filter((group) => group.items.length > 0)
    .sort((a, b) => a.priority - b.priority);
}
