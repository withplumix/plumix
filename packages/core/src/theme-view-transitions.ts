import { viewTransitionTypes } from "./view-transition.js";

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

const FORWARD = JSON.stringify(viewTransitionTypes.forward);
const BACK = JSON.stringify(viewTransitionTypes.back);
const REPLACE = JSON.stringify(viewTransitionTypes.replace);

// Inline and classic, so it is registered before the first frame, when
// `pagereveal` fires. Without the Navigation API (Safari 18.2 to 26.1) it adds
// no type and the base animation runs. Reloads never animate, so a `reload`
// activation never arrives with a view transition.
const DIRECTION_SCRIPT =
  'addEventListener("pagereveal",function(e){' +
  "var t=e.viewTransition,a=window.navigation&&navigation.activation;" +
  "if(!t||!a)return;" +
  "var k=a.navigationType,y;" +
  `if(k==="push")y=${FORWARD};` +
  `else if(k==="replace")y=${REPLACE};` +
  'else if(k==="traverse"&&a.from){' +
  `if(a.entry.index>a.from.index)y=${FORWARD};` +
  `else if(a.entry.index<a.from.index)y=${BACK}}` +
  "if(y)t.types.add(y)})";

/**
 * The head `<script>` that adds the navigation's direction to its view
 * transition as one of `viewTransitionTypes`; empty when the setting is off.
 */
export function viewTransitionsScriptTag(
  resolved: ResolvedViewTransitions | null,
): string {
  if (resolved === null) return "";
  return `<script>${DIRECTION_SCRIPT}</script>`;
}
