// The gate wiring stays internal. A plugin publishing a public artefact about
// an entry asks the entry's policy through `anonymousContext`.
export { anonymousContext } from "./anonymous-context.js";
export type {
  EntryAccessSubject,
  EntryAdmission,
} from "../entries/entry-access.js";
export { entryPolicyAdmits } from "../entries/entry-access.js";
export * from "./policy.js";
export { PRIVATE_SEGMENT } from "./contract/segments.js";
