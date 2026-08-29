// The one place a field's wire name is spelled. A form is a flat
// urlencoded body, so a field inside a group or a repeater row needs a
// name that says where it sits — and the renderer and the submit handler
// have to spell it the same way or every nested answer is lost.
//
// Field keys are `[a-zA-Z0-9_:-]+`, so brackets and dots cannot occur in
// one: both encodings below are unambiguous by construction.

/**
 * The name a field posts under: its own key at the top of the form,
 * bracketed under its container below that — `address[city]`, or
 * `referees[0][email]` for the same field in a repeater's first row.
 */
export function fieldName(parent: string | undefined, key: string): string {
  return parent === undefined ? key : `${parent}[${key}]`;
}

/** The name prefix one row of a repeater's fields sit under. */
export function rowName(name: string, index: number): string {
  return `${name}[${String(index)}]`;
}

/**
 * The hidden input each rendered row carries, one per row, so the handler
 * can tell how many rows came back. A repeater never posts a value of its
 * own, so nothing else can claim this name.
 */
export function rowMarkerName(name: string): string {
  return `${name}[]`;
}

/**
 * The element id for a control posting under `name`. Brackets become dots
 * rather than travelling into an `id` a summary link has to address as a
 * URL fragment, where they are reserved — and a top-level field keeps the
 * plain `<idBase>-<key>` it has always had.
 */
export function elementId(idBase: string, name: string): string {
  return `${idBase}-${name.replaceAll("[", ".").replaceAll("]", "")}`;
}
