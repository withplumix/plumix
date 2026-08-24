import type { OpenBag } from "./open-bag.js";

// Reading a key off a bag whose index signature already says `unknown` is what
// an open bag is for — the declaration named itself and said why (issue #1820).
export function label(bag: OpenBag): string {
  return typeof bag.label === "string" ? bag.label : "";
}

interface SettingsRow {
  readonly value: unknown;
}

export function salt(row: SettingsRow | undefined): string | null {
  // Not parsed: the settings column is declared `unknown` and its value reaches
  // storage without passing the field pipeline, so nothing has a schema for it
  // yet (issue #1817).
  return typeof row?.value === "string" ? row.value : null;
}

// The label descriptor idiom: `typeof` picks an arm of a union the compiler
// already knows, which is the documented way to flatten a `Label`.
interface MessageDescriptor {
  readonly id: string;
  readonly message?: string;
}
type Label = string | MessageDescriptor;

export function labelSourceText(value: Label): string {
  return typeof value === "string" ? value : (value.message ?? "");
}

// The same union, reached through a property. What makes the check honest is
// the declared type, not the spelling of the read.
interface FieldManifestEntry {
  readonly label: Label;
}

export function entryLabelText(entry: FieldManifestEntry): string {
  return typeof entry.label === "string" ? entry.label : entry.label.id;
}

// A callable configuration slot: the literal-vs-resolver discriminator on an
// `EnvInput`-shaped union, where the whole point of the check is which arm
// arrived.
type EnvInput<T> = T | ((env: Record<string, string>) => T);

export function resolveEnvInput<T>(
  input: EnvInput<T>,
  env: Record<string, string>,
): T {
  if (typeof input !== "function") return input;
  return (input as (env: Record<string, string>) => T)(env);
}

// A parse boundary's own subject. `unknown` is the correct input type for a
// function that decodes, and the first check inside one has nothing to reach
// through — including when a schema library is the caller.
export function isPlainObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

// Probing a live object for a member `JSON` could never have carried: a
// function and a symbol do not survive serialization, so asking for one is a
// structural question about the value in hand, not a parse that was skipped.
export function isThenable(value: unknown): boolean {
  return typeof (value as { then?: unknown }).then === "function";
}

export function isReactElementValue(value: unknown): boolean {
  return typeof (value as { $$typeof?: unknown }).$$typeof === "symbol";
}

// A list is a dictionary spelled the other way: an element of an `unknown[]`
// is undescribed because the array's own type said so.
export function firstIsText(values: readonly unknown[]): boolean {
  return typeof values[0] === "string";
}

// One statement, one note: a check inside a single-expression callback belongs
// to the statement the callback is written in, so the note above it covers it.
export function labels(bags: readonly OpenBag[]): string[] {
  // Not parsed: the stored bag is the deferred settings shape, so there is
  // nothing yet to decode these rows against.
  return bags.map((bag) => (typeof bag.label === "string" ? bag.label : ""));
}
