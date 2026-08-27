// Plugin admin entry. The plumix vite plugin namespace-imports this module
// into the per-site admin chunk, so the field-type registration below is a
// load-time side effect. Nothing else belongs here: the bundler synthesises
// `registerPluginPage` calls from `ctx.registerAdminPage` declarations, and an
// imperative one in this body would register a second time and break the shell.

import type { ComponentType } from "react";

import { CARD_PREVIEW_INPUT_TYPE } from "../preview-box.js";
import { CardPreviewField } from "./CardPreviewField.js";

// The slice of the host admin's `window.plumix` this entry needs. The full
// declaration lives in `packages/admin/src/lib/plumix-globals.ts`.
interface PlumixWindowGlobal {
  readonly registerPluginFieldType: (
    type: string,
    component: ComponentType<never>,
  ) => void;
}

declare const window:
  | {
      readonly plumix?: PlumixWindowGlobal;
    }
  | undefined;

/**
 * Exported so the behaviour is testable without re-running the module's
 * load-time side effect, which `vi.resetModules()` can otherwise run twice.
 */
export function registerOgAdmin(plumix: PlumixWindowGlobal | undefined): void {
  if (!plumix) {
    // A silent no-op would leave the preview falling through to the admin's
    // text-input fallback for the whole session, with nothing to diagnose it
    // by. Surface the load-order problem instead.
    console.warn(
      "[plumix-plugin-og] window.plumix not initialized — the card " +
        "preview field is not registered. Verify the host admin has booted " +
        "plumix-globals before the plugin chunk loads.",
    );
    return;
  }
  plumix.registerPluginFieldType(
    CARD_PREVIEW_INPUT_TYPE,
    CardPreviewField as ComponentType<never>,
  );
}

if (typeof window !== "undefined") {
  registerOgAdmin(window.plumix);
}

export { CardPreviewField } from "./CardPreviewField.js";
