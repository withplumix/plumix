import type { TemplateData } from "plumix";
import type { AppContext } from "plumix/plugin";
import type { ReactElement } from "react";
import { labelSourceText } from "plumix/i18n";
import { archiveSlugForEntryType, tryGetContext } from "plumix/plugin";
import { withBasePath } from "plumix/support";

/** One step of the trail. */
export interface BreadcrumbItem {
  /**
   * Absolute URL, or null on the last step — the page you are already on,
   * which Google asks to be left unlinked.
   */
  readonly url: string | null;
  readonly name: string;
}

/**
 * English, like core's own public-route strings; a theme wanting a translated
 * trail renders `breadcrumbTrail` itself.
 */
const HOME = "Home";

function absolute(ctx: AppContext, path: string): string {
  return `${ctx.origin}${withBasePath(path, ctx.config.basePath)}`;
}

/**
 * Also the base of every site-scoped `@id` in the structured-data graph. No
 * trailing slash under a base path.
 */
export function siteRoot(ctx: AppContext): string {
  return absolute(ctx, "/");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Spelled the way core titles a date archive, so the crumb reads like the page.
 */
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
 * Mirrors the router: a non-public type has no archive route even with
 * `hasArchive`, so `archiveSlugForEntryType` alone would link a dead URL.
 */
function archiveStep(ctx: AppContext, type: string): BreadcrumbItem | null {
  const registered = ctx.plugins.entryTypes.get(type);
  if (!registered?.isPublic) return null;
  const slug = archiveSlugForEntryType(registered);
  if (slug === null) return null;
  return {
    url: absolute(ctx, `/${slug}`),
    name: labelSourceText(registered.labels?.plural ?? registered.label),
  };
}

/**
 * A plugin archive's hierarchy is its owner's to describe via
 * `seo:schema:piece`. Ancestors aren't walked: that would cost a DB round-trip
 * per render.
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
    case "entryType": {
      const step = archiveStep(ctx, data.contentType);
      return step ? [step] : null;
    }
    case "term":
      return [{ url: null, name: data.term.name }];
    case "author":
      return [{ url: null, name: data.author.name ?? data.author.slug }];
    case "date":
      return [{ url: null, name: dateName(data.year, data.month, data.day) }];
    case "search":
      return [{ url: null, name: `Search: ${data.query}` }];
    case "frontPage":
    case "archiveType":
    case "view":
    case "error":
      return null;
  }
}

/**
 * Home first, the current page last and unlinked; empty where there is no
 * trail. Shared by the `BreadcrumbList` and {@link Breadcrumbs} so they agree.
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
 * Renders nothing on a page with no trail. Style it through the
 * `data-plumix-breadcrumbs` attribute; there is no class-name API.
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
