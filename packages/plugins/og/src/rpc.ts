import {
  authenticated,
  base,
  previewableEntry,
  resolveEntryData,
} from "plumix/plugin";
import * as v from "valibot";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { CardPreview } from "./preview.js";
import type { CardRenderer } from "./renderer.js";
import { previewCard } from "./preview.js";

export interface OgRouterOptions {
  readonly cards: CardRegistry;
  readonly renderer: CardRenderer;
  readonly inputs: () => CardInputs;
  /** The extension a card reaches the page head under, if any. */
  readonly extension: string | undefined;
  /** The entry types the site asked for a preview on. */
  readonly entryTypes: readonly string[];
}

/**
 * Read-only: a per-entry override would compete with the role markers. With
 * `remote()`, card content reaches the operator's endpoint.
 */
export function createOgRouter(options: OgRouterOptions) {
  const preview = base
    .use(authenticated)
    .input(
      v.object({ entryId: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
    )
    .handler(async ({ input, context, errors }): Promise<CardPreview> => {
      const row = await previewableEntry(
        context,
        { entryId: input.entryId, entryTypes: options.entryTypes },
        errors,
      );
      return previewCard({
        data: await resolveEntryData(context, row),
        ctx: context,
        cards: options.cards,
        renderer: options.renderer,
        inputs: options.inputs(),
        extension: options.extension,
      });
    });

  return { preview };
}

/**
 * The admin chunk's wire contract, imported there with `import type` so this
 * module stays server-only.
 */
export type OgRouter = ReturnType<typeof createOgRouter>;
