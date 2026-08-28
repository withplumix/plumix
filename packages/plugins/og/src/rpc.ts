import { buildResolvedEntries, previewableEntry } from "plumix";
import { authenticated, base } from "plumix/plugin";
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
 * The plugin's admin surface: one procedure, answering what the entry being
 * edited will be shared with. Read-only by design — a per-entry override would
 * be a second precedence authority beside the role markers.
 *
 * Nothing rendered here is stored or served to anyone else; with a `remote()`
 * renderer connected the card's content does reach the endpoint that renderer
 * names, which is the operator's own service.
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
      const [entry] = await buildResolvedEntries(context, [row]);
      if (entry === undefined) {
        throw errors.NOT_FOUND({
          data: { kind: "entry", id: input.entryId },
        });
      }
      return previewCard({
        data: { kind: "entry", entry },
        ctx: context,
        cards: options.cards,
        renderer: options.renderer,
        inputs: options.inputs(),
        extension: options.extension,
      });
    });

  return { preview };
}
