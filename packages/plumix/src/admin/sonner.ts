// Shim for `sonner`: re-exports the host admin shell's instance from
// `window.plumix.runtime.sonner` so plugin chunks share it instead of
// bundling their own copy. The plugin-bundle Vite step aliases bare
// `sonner` imports here (see SHARED_ADMIN_RUNTIME_SPECIFIERS in
// @plumix/core). A curated surface, not a full mirror — shim-drift.test.ts
// fails CI only if a binding re-exported here disappears upstream (#1177); add
// new upstream bindings when a plugin needs them.
import type * as SonnerNs from "sonner";

import { getRuntime } from "./runtime.js";

const ns = getRuntime().sonner;

export default ns;

export const Toaster = ns.Toaster;
// Annotated so declaration emit names sonner's type rather than its
// non-exported internal `PromiseIExtendedResult` return type (TS4023).
export const toast: typeof SonnerNs.toast = ns.toast;
export const useSonner = ns.useSonner;
