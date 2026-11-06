// Consumer-facing server surface. Themes import the thread types from
// here to type their `comments` template-dep render arg; importing this
// barrel also pulls in the `TemplateDepRegistry` augmentation declared
// alongside `ResolvedThread`.
export type {
  ResolvedComment,
  ResolvedThread,
  ResolvedThreadPage,
} from "./load-thread.js";
export { loadThread } from "./load-thread.js";
// Re-exported so a third-party moderation plugin can type a handler of the
// `comment.moderate` filter outside the call that subscribes it.
export type { CommentModerationCandidate } from "./events.js";
