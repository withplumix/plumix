import type { JsonObject, JsonValue } from "../json.js";
import type { HtmlAllowlist } from "./html/sanitize.js";
import type { PlumixContextValue } from "./renderer/context.js";
import type { ThemeBreakpoints } from "./styles/style-emitter.js";
import type { ThemeTokens } from "./styles/types.js";
import { isJsonArray, isJsonObject } from "../json.js";

/**
 * `true` when the embed carries the field into the canvas, otherwise the reason
 * it doesn't. A new context field fails to compile until someone decides.
 */
export type RenderEnvPolicy<TContext> = {
  readonly [K in keyof TContext]-?: true | string;
};

export const RENDER_ENV_POLICY = {
  tokens: true,
  breakpoints: true,
  locale: true,
  entry: true,
  siteSettings: true,
  registry:
    "functions; the editor bundle rebuilds it from the block modules the " +
    "build recovers from theme and plugin config",
  shortcodes:
    "functions; the editor bundle rebuilds it from the shortcode modules the " +
    "build recovers from theme and plugin config",
  mode: "the canvas only ever renders in edit mode",
  loaderData:
    "rides its own `data-plumix-loader-data` embed, which scoped refreshes " +
    "then merge into",
  user:
    "the author's own account (email, meta) stays out of the page source; " +
    "`useUser` in the canvas reads the signed-out `null`",
  authMethods:
    "no block input: `useAuthMethods` reads `null` in the canvas, as in any " +
    "render that doesn't supply them",
  queriedEntry:
    "blocks read the entry itself through `entry`; `useQueriedEntry` reads " +
    "`null` in the canvas",
  basePath:
    "links in the canvas never navigate — its navigation guard cancels them",
  imageResolver:
    "a closure over the request's image-delivery binding, so not " +
    "serializable; canvas images load unoptimized",
  imageRemotePatterns:
    "only consulted alongside `imageResolver`, which cannot cross",
  renderFilters:
    "server-only: closes over the request-scoped hook executor, and the " +
    "canvas has no hook runtime",
  catalog:
    "the host pushes its merged catalog over `host:config` after mount, " +
    "with the locale it belongs to (ADR 0016)",
} as const satisfies RenderEnvPolicy<PlumixContextValue>;

type CarriedKey = {
  [
    K in keyof typeof RENDER_ENV_POLICY
  ]: (typeof RENDER_ENV_POLICY)[K] extends true ? K : never;
}[keyof typeof RENDER_ENV_POLICY];

const CARRIED_KEYS = Object.keys(RENDER_ENV_POLICY).filter(
  (key): key is CarriedKey =>
    RENDER_ENV_POLICY[key as keyof typeof RENDER_ENV_POLICY] === true,
);

/**
 * `htmlAllowlist` travels here but lives in its own React context in the
 * canvas.
 */
export type RenderEnv = {
  readonly [K in CarriedKey]?: PlumixContextValue[K];
} & { readonly htmlAllowlist?: HtmlAllowlist };

/**
 * Lossy by design: a date field arrives as its ISO string, a reference as the
 * entity's plain fields, and anything `JSON.stringify` can't carry is dropped.
 */
export function serializeRenderEnv(
  ctx: PlumixContextValue,
  htmlAllowlist: HtmlAllowlist,
): string {
  const env: Partial<Record<CarriedKey, PlumixContextValue[CarriedKey]>> = {};
  for (const key of CARRIED_KEYS) env[key] = ctx[key];
  return JSON.stringify({ ...env, htmlAllowlist });
}

/**
 * Never throws: malformed input or fields are dropped, since a throw in the
 * canvas takes the whole editor down.
 */
export function parseRenderEnv(json: string): RenderEnv {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(json) as JsonValue;
  } catch {
    return {};
  }
  if (!isJsonObject(parsed)) return {};
  const { tokens, breakpoints, htmlAllowlist, locale, entry, siteSettings } =
    parsed;
  return {
    // Unchecked: our SSR wrote them from typed config, and the style emitter
    // sanitizes every value.
    tokens: isObject(tokens) ? (tokens as ThemeTokens) : undefined,
    breakpoints: decodeBreakpoints(breakpoints),
    htmlAllowlist: decodeHtmlAllowlist(htmlAllowlist),
    locale: typeof locale === "string" ? locale : undefined,
    entry: isObject(entry) ? entry : undefined,
    siteSettings: isObject(siteSettings) ? siteSettings : undefined,
  };
}

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== undefined && isJsonObject(value);

function isStringArray(
  value: JsonValue | undefined,
): value is readonly string[] {
  return (
    value !== undefined &&
    isJsonArray(value) &&
    value.every((item) => typeof item === "string")
  );
}

function decodeBreakpoints(
  value: JsonValue | undefined,
): ThemeBreakpoints | undefined {
  if (!isObject(value)) return undefined;
  const { tablet, mobile } = value;
  return typeof tablet === "number" && typeof mobile === "number"
    ? { tablet, mobile }
    : undefined;
}

/**
 * The sanitiser's floors, not this decode, are what keep a tampered allowlist
 * from re-admitting a denied tag; this only drops one the sanitiser can't read.
 */
function decodeHtmlAllowlist(
  value: JsonValue | undefined,
): HtmlAllowlist | undefined {
  if (!isObject(value)) return undefined;
  const {
    allowedTags,
    allowedAttributes,
    allowedSchemes,
    allowProtocolRelative,
  } = value;
  if (!isStringArray(allowedTags) || !isObject(allowedAttributes)) {
    return undefined;
  }
  const attributes: Record<string, readonly string[]> = {};
  for (const [tag, attrs] of Object.entries(allowedAttributes)) {
    if (isStringArray(attrs)) attributes[tag] = attrs;
  }
  return {
    allowedTags,
    allowedAttributes: attributes,
    allowedSchemes: isStringArray(allowedSchemes) ? allowedSchemes : undefined,
    allowProtocolRelative:
      typeof allowProtocolRelative === "boolean"
        ? allowProtocolRelative
        : undefined,
  };
}
