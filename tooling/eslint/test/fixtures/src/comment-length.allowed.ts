// One short reason.
export const short = 1;

// Two blocks separated by a blank line are counted apart, so this one stays
// under the limit.

// And this one does as well, even though together they would not.
export const separate = 2;

export function directives(): number {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- a directive's reason is not prose for the reader of the code, it is addressed to the linter, so its length is not counted here
  return short + separate;
}

/**
 * Augment it to register a template.
 *
 * ```ts
 * declare module "plumix" {
 *   interface TemplateRegistry {
 *     landing: { readonly hero: string; readonly subtitle: string };
 *     article: { readonly title: string; readonly author: string };
 *     gallery: { readonly images: string; readonly caption: string };
 *     contact: { readonly email: string; readonly phone: string };
 *   }
 * }
 * ```
 */
export interface TemplateRegistry {
  readonly default: string;
}

/**
 * Builds a slug.
 *
 * @example
 * const slug = toSlug("Hello World, this is a long title with many words");
 * const other = toSlug("Another long example title with even more words here");
 * const third = toSlug("Yet another title that keeps the example honest and long");
 */
export function toSlug(title: string): string {
  return title.toLowerCase();
}
