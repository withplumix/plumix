// Structurally compatible with `@plumix/core/i18n`'s `Label` —
// `@plumix/core` depends on `@plumix/blocks`, not the other way around
// (see `loaders.ts`), so this package can't import from it. Mirrors the
// extractor-visible fields of Lingui's `MessageDescriptor` (id, message,
// comment); plugin authors pass core's `Label` here and TS structural
// typing accepts the assignment.
export interface MessageDescriptorLike {
  readonly id: string;
  readonly message?: string;
  readonly comment?: string;
}

export type Label = string | MessageDescriptorLike;

/**
 * A Lingui-compiled catalog as `lingui compile` emits it: a lone string for a
 * plain message, otherwise a token array where a `[name]` tuple is a
 * placeholder. Wider than the `.d.mts` the compile step declares so Lingui's
 * own `Messages` record assigns to it.
 */
export type CompiledCatalog = Readonly<
  Record<string, string | readonly (string | readonly unknown[])[]>
>;

/** Placeholder values for a descriptor whose message carries `{name}` slots. */
export type MessageValues = Readonly<Record<string, string>>;

const PLACEHOLDER = /\{(\w+)\}/g;

// Plain object access, not Lingui's runtime: the blocks package renders on the
// Worker, in the canvas iframe and in the admin alike, and carries no
// `@lingui/*` dependency. Only simple `{name}` placeholders are supported — a
// token this can't read (plural/select) drops to the English source.
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
  descriptor: MessageDescriptorLike,
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
