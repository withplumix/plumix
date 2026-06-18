// Shim for `sonner`: re-exports the host admin shell's instance from
// `window.plumix.runtime.sonner` so plugin chunks share it instead of
// bundling their own copy. The plugin-bundle Vite step aliases bare
// `sonner` imports here (see SHARED_ADMIN_RUNTIME_SPECIFIERS in
// @plumix/core). Re-export every public upstream member — shim-drift.test.ts
// fails CI if this falls behind upstream.
import type * as SonnerNs from "sonner";

import { getRuntime } from "./runtime.js";

const ns = getRuntime().sonner;

export default ns;

export const Toaster = ns.Toaster;
// Annotated so declaration emit names sonner's type rather than its
// non-exported internal `PromiseIExtendedResult` return type (TS4023).
export const toast: typeof SonnerNs.toast = ns.toast;
export const useSonner = ns.useSonner;
