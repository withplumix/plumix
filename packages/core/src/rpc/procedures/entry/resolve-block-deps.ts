import type { JsonObject } from "../../../json.js";
import { collectBlockDepKeys, isEntryContent } from "../../../blocks/index.js";
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
    const deps = await loadTemplateDeps(
      keys,
      context.plugins.templateDeps,
      context,
    );
    // JSON on the way out: the canvas receives what the page's embed carries.
    return {
      deps: JSON.parse(JSON.stringify(deps)) as Record<string, JsonObject>,
    };
  });
