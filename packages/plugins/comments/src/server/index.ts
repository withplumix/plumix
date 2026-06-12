// Consumer-facing server surface. Themes import the thread types from
// here to type their `comments` template-dep render arg; importing this
// barrel also pulls in the `TemplateDepRegistry` augmentation declared
// alongside `ResolvedThread`.
export type { ResolvedComment, ResolvedThread } from "./load-thread.js";
export { loadThread } from "./load-thread.js";
// Re-exported so a third-party moderation plugin can type its
// `comment:moderate` filter; importing it also pulls the plugin's
// FilterRegistry/ActionRegistry augmentation into scope.
export type { CommentModerationCandidate } from "./hooks.js";
