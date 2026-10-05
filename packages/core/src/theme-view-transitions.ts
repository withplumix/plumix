/**
 * A theme's opt-in to native cross-document view transitions (ADR 0031).
 * `"always"` keeps transitions on for visitors who prefer reduced motion,
 * leaving that setting to the theme's own CSS.
 */
export type ViewTransitionsInput =
  | boolean
  | "always"
  | {
      readonly enabled: boolean | "always";
      readonly types?: readonly string[];
    };

export interface ResolvedViewTransitions {
  readonly enabled: true | "always";
  readonly types: readonly string[];
}

/** `null` when the setting is missing or off: the head carries nothing. */
export function resolveViewTransitions(
  input: ViewTransitionsInput | undefined,
): ResolvedViewTransitions | null {
  if (input === undefined || input === false) return null;
  if (typeof input !== "object") return { enabled: input, types: [] };
  if (input.enabled === false) return null;
  return { enabled: input.enabled, types: input.types ?? [] };
}

const REDUCED_MOTION =
  "@media (prefers-reduced-motion:reduce){@view-transition{navigation:none}}";

/** The head `<style>` for a resolved setting; empty when it's off. */
export function viewTransitionsStyleTag(
  resolved: ResolvedViewTransitions | null,
): string {
  if (resolved === null) return "";
  const types =
    resolved.types.length > 0 ? `;types:${resolved.types.join(" ")}` : "";
  const reducedMotion = resolved.enabled === "always" ? "" : REDUCED_MOTION;
  return `<style>@view-transition{navigation:auto${types}}${reducedMotion}</style>`;
}
