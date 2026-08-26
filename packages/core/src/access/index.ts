// The developer-facing access-policy primitives. The gate wiring
// (`policyForMatch` / `gateToResponse`) stays framework-internal — the
// dispatcher imports it from `./gate.js` directly rather than through this
// barrel. `entryAllowsAnonymousAccess` is the one piece of it a plugin needs:
// anything publishing a public artefact about an entry has to ask the same
// access question the entry's own page does.
export type { EntryAccessSubject } from "./gate.js";
export { entryAllowsAnonymousAccess } from "./gate.js";
export * from "./policy.js";
