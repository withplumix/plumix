// Plugin admin entry. Bundled by the plumix vite plugin into the host
// admin's plugin chunk. The plumix bundler namespace-imports this module
// and emits a `window.plumix.registerPluginPage("/media", MediaLibrary)`
// call into the synthesised admin chunk based on the `component:
// "MediaLibrary"` ref we passed to `ctx.registerAdminPage`. So the
// plugin's only job here is to expose the export by name.
//
// Field-type registration is a side-effect of module load — the
// host's plumix-globals bootstrap runs first, then the plugin chunk
// loads and the side-effect call below pushes the renderer into
// `registerPluginFieldType`'s registry. The host's meta-box-field
// dispatcher consults that registry on every render.

import type { ComponentType } from "react";

import { MediaPickerField } from "./MediaPickerField.js";

// Minimal structural shape of the host admin's `window.plumix` —
// we only need the field-type registration entry. The host's full
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

if (typeof window !== "undefined") {
  if (window.plumix) {
    window.plumix.registerPluginFieldType(
      "media",
      MediaPickerField as ComponentType<never>,
    );
  } else {
    // Silent no-op would leave the `media` field renderer unregistered
    // for the whole session — every media field would fall through to
    // the legacy text-input fallback with no error visible. Surface the
    // misconfiguration so a deployment with a broken load-order is
    // diagnosable instead of silently degraded.
    console.warn(
      "[plumix-plugin-media] window.plumix not initialized — `media` " +
        "field renderer not registered. Verify the host admin has booted " +
        "plumix-globals before the plugin chunk loads.",
    );
  }
}

export { MediaLibrary } from "./MediaLibrary.js";
export { MediaPickerField } from "./MediaPickerField.js";
