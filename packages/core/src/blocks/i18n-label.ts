import type { MessageDescriptor } from "@lingui/core";

/**
 * Wider than the `.d.mts` the compile step declares so Lingui's own
 * `Messages` record assigns to it.
 */
export type CompiledCatalog = Readonly<
  Record<string, string | readonly (string | readonly unknown[])[]>
>;

/** Placeholder values for a descriptor whose message carries `{name}` slots. */
export type MessageValues = Readonly<Record<string, string>>;

const PLACEHOLDER = /\{(\w+)\}/g;

// Plain object access: blocks render on the Worker, in the canvas iframe and
// in the admin, none with a Lingui runtime. Plural/select tokens drop to the
// English source.
function fromCatalog(
  value: CompiledCatalog[string] | undefined,
  values: MessageValues | undefined,
): string | undefined {
  if (typeof value === "string") return value;
  if (value === undefined) return undefined;
  let text = "";
  for (const token of value) {
    if (typeof token === "string") {
      text += token;
      continue;
    }
    const [name] = token;
    if (token.length !== 1 || typeof name !== "string") return undefined;
    text += values?.[name] ?? `{${name}}`;
  }
  return text;
}

/**
 * Resolves a descriptor against a compiled catalog: the catalog's entry, then
 * the descriptor's English `message`, then its bare id.
 */
export function resolveMessage(
  catalog: CompiledCatalog,
  descriptor: MessageDescriptor,
  values?: MessageValues,
): string {
  const text = fromCatalog(catalog[descriptor.id], values);
  if (text !== undefined && text.length > 0) return text;
  if (descriptor.message === undefined) return descriptor.id;
  return descriptor.message.replace(
    PLACEHOLDER,
    (match, name: string) => values?.[name] ?? match,
  );
}
