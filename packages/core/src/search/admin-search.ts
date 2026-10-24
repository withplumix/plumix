import type { AppContext } from "../context/app-context.js";
import type {
  AdminSearchInput,
  RegisteredSearchProvider,
  SearchGroup,
} from "../plugin/search-provider.js";
import { logErrorSafely } from "../context/log.js";

const ORDER_RANK = { early: 0, default: 1, late: 2 } as const;

/**
 * A throwing provider contributes nothing. Providers sharing a group key fill
 * it in order, deduplicated and capped, so a provider ahead of core leads and
 * core fills the rest.
 */
export async function runAdminSearch(
  input: AdminSearchInput,
  ctx: AppContext,
): Promise<readonly SearchGroup[]> {
  // A stable sort, so each band keeps registration order: core, then plugins.
  const providers = [...ctx.plugins.searchProviders.values()].sort(
    (a, b) =>
      ORDER_RANK[a.order ?? "default"] - ORDER_RANK[b.order ?? "default"],
  );
  const produced = await Promise.all(
    providers.map((provider) => answer(provider, input, ctx)),
  );
  const merged = new Map<string, SearchGroup>();
  for (const group of produced.flat()) {
    const held = merged.get(group.key);
    if (held === undefined) {
      if (group.items.length > 0) merged.set(group.key, group);
      continue;
    }
    const seen = new Set(held.items.map((item) => item.id));
    const extra = group.items.filter((item) => !seen.has(item.id));
    if (extra.length === 0) continue;
    merged.set(group.key, {
      ...held,
      items: [...held.items, ...extra].slice(0, input.limit),
    });
  }
  return [...merged.values()].sort((a, b) => a.priority - b.priority);
}

async function answer(
  provider: RegisteredSearchProvider,
  input: AdminSearchInput,
  ctx: AppContext,
): Promise<readonly SearchGroup[]> {
  try {
    return await provider.search(input, ctx);
  } catch (error) {
    const plugin = provider.registeredBy;
    logErrorSafely(
      ctx.logger,
      `[plumix] search provider failed provider=${provider.id} plugin=${plugin ?? "core"}`,
      error,
      { provider: provider.id, plugin },
    );
    return [];
  }
}
