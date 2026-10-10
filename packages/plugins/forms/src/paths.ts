// Field keys are `[a-zA-Z0-9_:-]+`, so brackets and dots never occur in
// one and both encodings are unambiguous.

/** `address[city]`, or `referees[0][email]` in a repeater's first row. */
export function fieldName(parent: string | undefined, key: string): string {
  return parent === undefined ? key : `${parent}[${key}]`;
}

/** The name prefix one row of a repeater's fields sit under. */
export function rowName(name: string, index: number): string {
  return `${name}[${String(index)}]`;
}

/** A repeater posts no value of its own, so nothing else claims this name. */
export function rowMarkerName(name: string): string {
  return `${name}[]`;
}

/** Brackets become dots, since they are reserved in a URL fragment. */
export function elementId(idBase: string, name: string): string {
  return `${idBase}-${name.replaceAll("[", ".").replaceAll("]", "")}`;
}
