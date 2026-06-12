import type {
  CommentsConfig,
  ModerationMode,
  RateLimitConfig,
} from "./types.js";

/** `CommentsConfig` with every knob filled in from its default. */
export interface ResolvedCommentsConfig {
  readonly entryTypes: readonly string[];
  readonly mode: ModerationMode;
  readonly maxDepth: number;
  readonly requireEmail: boolean;
  readonly closeAfterDays: number | null;
  readonly rateLimit: RateLimitConfig;
}

export function resolveConfig(options: CommentsConfig): ResolvedCommentsConfig {
  return {
    entryTypes: options.entryTypes ?? [],
    mode: options.mode ?? "first_time",
    maxDepth: options.maxDepth ?? 3,
    requireEmail: options.requireEmail ?? true,
    closeAfterDays: options.closeAfterDays ?? null,
    rateLimit: options.rateLimit ?? { max: 5, windowMin: 10 },
  };
}
