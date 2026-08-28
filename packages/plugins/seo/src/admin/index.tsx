// Plugin admin entry. The plumix vite plugin namespace-imports this module
// into the per-site admin chunk, so the field-type registration below is a
// load-time side effect. Nothing else belongs here: the bundler synthesises
// `registerPluginPage` calls from `ctx.registerAdminPage` declarations, and an
// imperative one in this body would register a second time and break the shell.

import type { ComponentType } from "react";

import { SERP_PREVIEW_INPUT_TYPE } from "../preview-box.js";
import { SerpPreviewField } from "./SerpPreviewField.js";

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
export function registerSeoAdmin(plumix: PlumixWindowGlobal | undefined): void {
  if (!plumix) {
    // A silent no-op would leave the preview falling through to the admin's
    // text-input fallback for the whole session, with nothing to diagnose it
    // by. Surface the load-order problem instead.
    console.warn(
      "[plumix-plugin-seo] window.plumix not initialized — the search " +
        "result preview is not registered. Verify the host admin has booted " +
        "plumix-globals before the plugin chunk loads.",
    );
    return;
  }
  plumix.registerPluginFieldType(
    SERP_PREVIEW_INPUT_TYPE,
    SerpPreviewField as ComponentType<never>,
  );
}

if (typeof window !== "undefined") {
  registerSeoAdmin(window.plumix);
}

export { SerpPreviewField } from "./SerpPreviewField.js";
