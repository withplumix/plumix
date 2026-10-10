// The gate wiring stays internal; a plugin publishing a public artefact about
// an entry needs `entryAllowsAnonymousAccess` to ask what the entry's page
// asks.
export type { EntryAccessSubject } from "./gate.js";
export { entryAllowsAnonymousAccess } from "./gate.js";
export * from "./policy.js";
export { PRIVATE_SEGMENT } from "./contract/segments.js";
