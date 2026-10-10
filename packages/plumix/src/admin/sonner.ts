// Shares the host admin shell's `sonner` instance with plugin chunks instead of
// bundling a copy.
import type * as SonnerNs from "sonner";

import { getRuntime } from "./runtime.js";

const ns = getRuntime().sonner;

export default ns;

export const Toaster = ns.Toaster;
// Annotated so declaration emit names sonner's type rather than its
// non-exported internal `PromiseIExtendedResult` return type (TS4023).
export const toast: typeof SonnerNs.toast = ns.toast;
export const useSonner = ns.useSonner;
