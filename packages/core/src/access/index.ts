// The gate wiring stays internal. A plugin publishing a public artefact about
// an entry asks the entry's policy through `anonymousContext`.
export { anonymousContext } from "./anonymous-context.js";
export type { EntryAccessSubject } from "./contract/access-key.js";
export * from "./policy.js";
export { PRIVATE_SEGMENT } from "./contract/segments.js";
