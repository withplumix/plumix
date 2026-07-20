import type { AppContext } from "./context/app.js";
import type {
  TemplateDepDeclarations,
  TemplateDepRegistry,
} from "./template.js";

/**
 * Loader signature for a template dep. Receives the slugs declared by
 * every template using this kind on the current request (deduped +
 * batched) and the per-request `AppContext`. Returns a record keyed by
 * slug. Slugs not present in the returned record render as `null` in
 * the deps passed to the template's render function.
 */
export type TemplateDepLoader<TKind extends keyof TemplateDepRegistry> = (
  slugs: readonly TemplateDepRegistry[TKind]["slug"][],
  ctx: AppContext,
) => Promise<Record<string, TemplateDepRegistry[TKind]["result"] | null>>;

// Untyped flavor used inside the framework's registry storage — the
// per-kind generic narrows are recovered when the loader is invoked
// against a declared kind in `defineTemplate`. Keeping the registry
// loose lets us store loaders for kinds the typed registry hasn't
// been augmented with yet (e.g. early plugin boot before module
// augmentation merges).
type UntypedTemplateDepLoader = (
  slugs: readonly string[],
  ctx: AppContext,
) => Promise<Record<string, unknown>>;

export interface RegisteredTemplateDep {
  readonly kind: string;
  readonly load: UntypedTemplateDepLoader;
  /** Plugin id, or `null` for core-registered deps (e.g. `settings`). */
  readonly registeredBy: string | null;
}

// Framework-owned keys on a theme or template object — `mergeTemplate…`
// must skip them so values like `render` (a function on every template)
// and `css` (an array on every theme) don't accidentally read as
// dep-kind declarations. `registerTemplateDep` rejects these as kinds
// too, so the runtime is the single source of truth for the policy.
const RESERVED_THEME_KEYS = new Set(["templates", "document", "tokens", "css"]);
const RESERVED_TEMPLATE_KEYS = new Set([
  "render",
  "document",
  "prefetchArchiveLoaders",
]);
export const RESERVED_DEP_KIND_NAMES: ReadonlySet<string> = new Set([
  ...RESERVED_THEME_KEYS,
  ...RESERVED_TEMPLATE_KEYS,
]);

/**
 * Combine theme + template dep declarations. The template's own
 * declaration for a kind replaces the theme's; absent declarations
 * inherit. Extending the inherited set is opt-in via the function
 * form (`menus: (prev) => [...prev, "x"]`).
 */
export function mergeTemplateDepDeclarations(
  themeDeps: TemplateDepDeclarations | undefined,
  template: Readonly<Record<string, unknown>>,
): Readonly<Record<string, readonly string[]>> {
  const result: Record<string, readonly string[]> = {};
  if (themeDeps) {
    for (const [kind, value] of Object.entries(themeDeps)) {
      if (RESERVED_THEME_KEYS.has(kind)) continue;
      if (Array.isArray(value)) result[kind] = value as readonly string[];
    }
  }
  for (const [kind, value] of Object.entries(template)) {
    if (RESERVED_TEMPLATE_KEYS.has(kind)) continue;
    if (Array.isArray(value)) {
      result[kind] = value as readonly string[];
    } else if (typeof value === "function") {
      const prev = result[kind] ?? [];
      const next = (value as (prev: readonly string[]) => readonly string[])(
        prev,
      );
      if (Array.isArray(next)) result[kind] = next;
    }
  }
  return result;
}

/**
 * Per-request dep loader. Reads the picked template's declared dep
 * slugs, fires every registered loader in parallel via `Promise.all`,
 * and assembles the results object passed into the render function.
 *
 * Loader failures don't break the render: the dep's result becomes
 * `{}` (empty per-slug map), the failure is logged via
 * `ctx.logger.error("template_dep_load_failed", { kind, slugs, err })`,
 * and the response stays 200.
 *
 * Slugs not present in a loader's returned record render as `null` in
 * the deps map — themes use optional chaining (`settings?.["site"]`).
 */
export async function loadTemplateDeps(
  template: Readonly<Record<string, unknown>>,
  registry: ReadonlyMap<string, RegisteredTemplateDep>,
  ctx: AppContext,
): Promise<Record<string, Record<string, unknown>>> {
  const pending: Promise<readonly [string, Record<string, unknown>]>[] = [];
  for (const [kind, loader] of registry) {
    const declared = template[kind];
    if (!Array.isArray(declared) || declared.length === 0) continue;
    const slugs = declared as readonly string[];
    pending.push(loadOne(kind, slugs, loader, ctx));
  }
  if (pending.length === 0) return {};
  return Object.fromEntries(await Promise.all(pending));
}

async function loadOne(
  kind: string,
  slugs: readonly string[],
  loader: RegisteredTemplateDep,
  ctx: AppContext,
): Promise<readonly [string, Record<string, unknown>]> {
  try {
    const raw = await loader.load(slugs, ctx);
    // Fill any slug the loader omitted with null — themes get a
    // stable shape per declared slug.
    const filled = Object.fromEntries(slugs.map((s) => [s, raw[s] ?? null]));
    return [kind, filled];
  } catch (err) {
    ctx.logger.error("template_dep_load_failed", {
      kind,
      slugs,
      err: err instanceof Error ? err.message : String(err),
    });
    return [kind, {}];
  }
}
