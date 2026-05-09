import type { LookupResult } from "@plumix/core";

import type { MenuItemMeta } from "../server/types.js";

export type ItemState = "ok" | "broken" | "unauthorized";

interface ItemStateInput {
  readonly meta: MenuItemMeta;
  readonly lookupResult: LookupResult | null;
  readonly canAccessKind: (kind: string) => boolean;
}

export function mapItemState(input: ItemStateInput): ItemState {
  // Custom URL items are inert — no referenced entity, no adapter to
  // gate, so they're always ok.
  if (input.meta.kind === "custom") return "ok";
  // Capability check trumps lookup outcome: a viewer who can't see
  // the kind shouldn't ever see an "ok" label, even if the resolver
  // happened to return one.
  if (!input.canAccessKind(input.meta.kind)) return "unauthorized";
  return input.lookupResult === null ? "broken" : "ok";
}
