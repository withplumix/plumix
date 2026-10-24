import type { DevRegistered } from "../context/dev-runtime.js";
import { DuplicateRegistrationError } from "../plugin/errors.js";

/**
 * Throws `DuplicateRegistrationError` when the id is already registered, so a
 * clash fails boot rather than hiding one item per request.
 */
export function registerDevItem<T extends { readonly id: string }>(
  items: Map<string, DevRegistered<T>>,
  kind: string,
  item: T,
  registeredBy: string | null,
): void {
  const existing = items.get(item.id);
  if (existing !== undefined) {
    throw DuplicateRegistrationError.alreadyRegistered({
      kind,
      identifier: item.id,
      pluginId: registeredBy ?? "core",
      previousOwner: existing.registeredBy,
    });
  }
  items.set(item.id, { ...item, registeredBy });
}
