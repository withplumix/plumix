import {
  authenticated,
  base,
  previewableEntry,
  resolveEntryData,
} from "plumix/plugin";
import * as v from "valibot";

import type { SerpPreview } from "./serp.js";
import { serpPreview } from "./preview.js";

export interface SeoRouterOptions {
  /** The entry types that carry the SEO box, and so the preview. */
  readonly entryTypes: readonly string[];
}

/**
 * The plugin's admin surface: one procedure, answering what the entry being
 * edited will look like in a search result. Read-only — every answer an author
 * can change is a meta field on the same box, saved with the entry.
 */
export function createSeoRouter(options: SeoRouterOptions) {
  const preview = base
    .use(authenticated)
    .input(
      v.object({ entryId: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
    )
    .handler(async ({ input, context, errors }): Promise<SerpPreview> => {
      const row = await previewableEntry(
        context,
        { entryId: input.entryId, entryTypes: options.entryTypes },
        errors,
      );
      return serpPreview(context, await resolveEntryData(context, row));
    });

  return { preview };
}

/**
 * The admin chunk's wire contract, imported there with `import type` so this
 * module stays server-only.
 */
export type SeoRouter = ReturnType<typeof createSeoRouter>;
