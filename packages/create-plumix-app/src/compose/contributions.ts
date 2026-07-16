import type { Contribution, Selection } from "./types.js";
import { ScaffoldError } from "../errors.js";

export interface ResolvedContributions {
  /** Raw import statements (merge into per-module lines downstream). */
  readonly imports: string[];
  /** Top-level `plumix({ ... })` slots, runtime → capabilities → plugins. */
  readonly configSlots: Record<string, string>;
  /** Merged wrangler.jsonc binding patches (arrays append). */
  readonly wrangler: Record<string, unknown>;
  /** `plugins: [...]` array entries, in selection order. */
  readonly registrations: string[];
}

/**
 * Fold a selection's runtime, the runtime capabilities its plugins require,
 * and the plugins themselves into one set of contributions. A required
 * capability is fulfilled once even if several plugins ask for it; a
 * capability the runtime does not provide is a hard error.
 */
export function resolveContributions(
  selection: Selection,
): ResolvedContributions {
  const { runtime, plugins } = selection;
  const acc: ResolvedContributions = {
    imports: [...runtime.imports],
    configSlots: { ...runtime.configSlots },
    wrangler: {},
    registrations: [],
  };

  const fulfilled = new Set<string>();
  for (const plugin of plugins) {
    for (const capability of plugin.requires ?? []) {
      if (fulfilled.has(capability)) continue;
      const provided = runtime.capabilities?.[capability];
      if (!provided) {
        throw ScaffoldError.unsupportedCapability({
          capability,
          plugin: plugin.id,
          runtime: runtime.id,
        });
      }
      fulfilled.add(capability);
      apply(acc, provided);
    }
  }

  for (const plugin of plugins) {
    apply(acc, plugin);
    acc.registrations.push(plugin.registration);
  }
  return acc;
}

// Array wrangler values append; config slots and scalar/object wrangler
// values are last-write-wins. Fine for today's disjoint descriptors; a
// future collision (two capabilities touching one slot) would need a guard.
function apply(acc: ResolvedContributions, contribution: Contribution): void {
  if (contribution.imports) acc.imports.push(...contribution.imports);
  if (contribution.configSlots)
    Object.assign(acc.configSlots, contribution.configSlots);
  for (const [key, value] of Object.entries(contribution.wrangler ?? {})) {
    const current = acc.wrangler[key];
    acc.wrangler[key] =
      Array.isArray(current) && Array.isArray(value)
        ? [...(current as unknown[]), ...(value as unknown[])]
        : value;
  }
}
