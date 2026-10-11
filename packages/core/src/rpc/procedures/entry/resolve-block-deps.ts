import type { JsonObject } from "../../../json.js";
import {
  collectBlockDepKeys,
  isEntryContent,
  pickDeps,
} from "../../../blocks/index.js";
import { loadAuthoredEntry } from "../../../entries/authored.js";
import { canReadEntry } from "../../../entries/visibility.js";
import { loadTemplateDeps } from "../../../template-deps.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryResolveBlockDepsInputSchema } from "./schemas.js";

/**
 * The canvas sends its tree, unsaved edits included. The server evaluates each
 * block's declaration, so a caller can't name keys no block declares.
 */
export const resolveBlockDeps = base
  .use(authenticated)
  .input(entryResolveBlockDepsInputSchema)
  .handler(async ({ input, context, errors }) => {
    const live = await loadAuthoredEntry(context.db, input.id);
    if (!live || !canReadEntry(context, live)) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: input.id } });
    }
    if (!isEntryContent(input.content)) return { deps: {} };

    const keys = collectBlockDepKeys([input.content.blocks], context.blocks);
    // A dep that ends the request reads `null`, as a block loader's outcome
    // is its loader error in the editor (ADR 0032).
    const loaded = await loadTemplateDeps(
      keys,
      context.plugins.templateDeps,
      context,
      { honourOutcomes: false },
    );
    // Every declared key is filled, so the canvas holds a failed one as `null`
    // rather than asking again. JSON, as the page's embed carries it.
    const deps = pickDeps(keys, loaded);
    return {
      deps: JSON.parse(JSON.stringify(deps)) as Record<string, JsonObject>,
    };
  });
