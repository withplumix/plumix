// Lingui's `MessageDescriptor` requires `id`; the tagged-template form
// of `tx` produces a descriptor without one (Lingui derives the runtime
// key from message+context at extract time, gettext-style). Use a
// relaxed shape so both authoring paths typecheck.
interface TxDescriptor {
  readonly id?: string;
  readonly message: string;
  readonly context: string;
  readonly comment?: string;
}

interface TxObjectInput {
  readonly message: string;
  readonly context: string;
  readonly id?: string;
  readonly comment?: string;
}

/** Context-tagged descriptor shorthand for disambiguating polysemes
 *  (gettext `msgctxt` / WP `_x()` parity). Two forms:
 *
 *  ```ts
 *  tx({ message: "Post", context: "noun" })   // object
 *  tx`Post`("noun")                            // tagged template
 *  ```
 *
 *  Same message with different `context` produces distinct catalog
 *  entries — translators get separate buckets for noun/verb senses
 *  that collide in English. */
export function tx<T extends TxObjectInput>(input: T): T;
export function tx(
  strings: TemplateStringsArray,
  ...values: readonly unknown[]
): (context: string) => TxDescriptor;
export function tx<T extends TxObjectInput>(
  arg: T | TemplateStringsArray,
  ...values: readonly unknown[]
): T | ((context: string) => TxDescriptor) {
  if (isTemplateStrings(arg)) {
    const message = assembleTemplate(arg, values);
    return (context: string) => ({ message, context });
  }
  return { ...arg };
}

function isTemplateStrings(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && "raw" in value;
}

function assembleTemplate(
  strings: TemplateStringsArray,
  values: readonly unknown[],
): string {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i += 1) {
    out += String(values[i]) + (strings[i + 1] ?? "");
  }
  return out;
}
