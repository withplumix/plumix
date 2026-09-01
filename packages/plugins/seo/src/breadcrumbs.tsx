import type { TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import type { ReactElement } from "react";
import { archiveSlugForEntryType, withBasePath } from "plumix";
import { labelSourceText } from "plumix/i18n";
import { tryGetContext } from "plumix/plugin";

/** One step of the trail. */
export interface BreadcrumbItem {
  /**
   * Absolute URL, or null on the last step — the page you are already on,
   * which Google asks to be left unlinked.
   */
  readonly url: string | null;
  readonly name: string;
}

// The three reader-facing strings this module writes — the first crumb, a
// search page's name and the landmark label — are English, matching core's own
// `page-data.ts` and `resolve.ts` spellings for the same pages. Public-route
// content i18n is a deferred userland seam in core too; a theme wanting a
// translated trail renders `breadcrumbTrail` itself.
const HOME = "Home";

function absolute(ctx: AppContext, path: string): string {
  return `${ctx.origin}${withBasePath(path, ctx.basePath)}`;
}

/**
 * The site root, which is both the first crumb's href and the base every
 * site-scoped `@id` in the structured-data graph hangs off — one derivation, so
 * the two cannot drift. Carries no trailing slash under a base path, where the
 * root is the prefix itself.
 */
export function siteRoot(ctx: AppContext): string {
  return absolute(ctx, "/");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// Spelled the way core titles a date archive, so the crumb reads like the page.
function dateName(
  year: number,
  month: number | null,
  day: number | null,
): string {
  if (month === null) return String(year);
  if (day === null) return `${String(year)}-${pad2(month)}`;
  return `${String(year)}-${pad2(month)}-${pad2(day)}`;
}

/**
 * The step for an entry type's own archive, or null where the type has none.
 *
 * Both halves of the router's own test, in its order: it skips a non-public
 * type before it asks about `hasArchive` at all (`compile.ts`), and
 * `archiveSlugForEntryType` answers only the second half — so asking it alone
 * would link `/secret` for a type that has no route. A non-public type can
 * still reach a render through a plugin's own public route.
 */
function archiveStep(ctx: AppContext, type: string): BreadcrumbItem | null {
  const registered = ctx.plugins.entryTypes.get(type);
  if (!registered || registered.isPublic === false) return null;
  const slug = archiveSlugForEntryType(registered);
  if (slug === null) return null;
  return {
    url: absolute(ctx, `/${slug}`),
    name: labelSourceText(registered.labels?.plural ?? registered.label),
  };
}

/**
 * Everything below Home, or null on a page that has no trail worth drawing:
 * the front page (Home is already where you are) and an error page.
 *
 * A plugin archive is null: core does not define that payload past the facts
 * it declares, so the archive's hierarchy is the owning plugin's to describe
 * through `seo:schema:piece`.
 *
 * Ancestors of a hierarchical entry or a nested term are not walked: both
 * would be a per-render DB round-trip, and both types already carry their own
 * pre-resolved `url`.
 */
function trailBelowHome(
  ctx: AppContext,
  data: TemplateData,
): readonly BreadcrumbItem[] | null {
  switch (data.kind) {
    case "entry": {
      const parent = archiveStep(ctx, data.entry.type);
      const self: BreadcrumbItem = { url: null, name: data.entry.title };
      return parent ? [parent, self] : [self];
    }
    case "archive": {
      const step = archiveStep(ctx, data.contentType);
      return step ? [step] : null;
    }
    case "taxonomy":
      return [{ url: null, name: data.term.name }];
    case "author":
      return [{ url: null, name: data.author.name ?? data.author.slug }];
    case "date":
      return [{ url: null, name: dateName(data.year, data.month, data.day) }];
    case "search":
      return [{ url: null, name: `Search: ${data.query}` }];
    case "frontPage":
    case "custom":
    case "error":
      return null;
  }
}

/**
 * The trail for this page, Home first, the current page last and unlinked.
 * Empty where there is no trail to draw.
 *
 * One source for both the `BreadcrumbList` in the structured-data graph and
 * the {@link Breadcrumbs} a theme renders, so the trail in the page and the
 * trail in search results cannot disagree.
 */
export function breadcrumbTrail(
  ctx: AppContext,
  data: TemplateData,
): readonly BreadcrumbItem[] {
  const below = trailBelowHome(ctx, data);
  if (below === null || below.length === 0) return [];
  const steps = [{ url: siteRoot(ctx), name: HOME }, ...below];
  // Where the trail ends is this function's to say, not each arm's: the last
  // step is the page being rendered, and linking it points at itself.
  return steps.map((step, index) =>
    index === steps.length - 1 ? { ...step, url: null } : step,
  );
}

/**
 * The trail, rendered. Drop it in a theme template and the page shows what the
 * `BreadcrumbList` in its head already claims:
 *
 * ```tsx
 * import { Breadcrumbs } from "@plumix/plugin-seo";
 *
 * export default function Post({ data }: { data: EntryData }) {
 *   return (
 *     <article>
 *       <Breadcrumbs data={data} />
 *       <h1>{data.entry.title}</h1>
 *     </article>
 *   );
 * }
 * ```
 *
 * Renders nothing on a page with no trail. Style it through the
 * `data-plumix-breadcrumbs` attribute; there is no class-name API to keep in
 * step with.
 */
export function Breadcrumbs({
  data,
}: {
  readonly data: TemplateData;
}): ReactElement | null {
  // The render runs inside the request store, so the same context the head
  // filter is handed is in reach here without a prop a theme has to thread.
  const ctx = tryGetContext();
  if (ctx === null) return null;
  const items = breadcrumbTrail(ctx, data);
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" data-plumix-breadcrumbs="">
      <ol>
        {items.map((item, index) => (
          // Position: the list is static, and two steps can share a name.
          <li key={index}>
            {item.url === null ? item.name : <a href={item.url}>{item.name}</a>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
