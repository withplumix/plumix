// Shim for `tailwind-merge`: re-exports the host admin shell's instance from
// `window.plumix.runtime.tailwindMerge` so plugin chunks share it instead of
// bundling their own copy. The plugin-bundle Vite step aliases bare
// `tailwind-merge` imports here (see SHARED_ADMIN_RUNTIME_SPECIFIERS in
// @plumix/core). A curated surface, not a full mirror — shim-drift.test.ts
// fails CI only if a binding re-exported here disappears upstream (#1177); add
// new upstream bindings when a plugin needs them.
import type * as TailwindMergeNs from "tailwind-merge";

import { getRuntime } from "./runtime.js";

const ns = getRuntime().tailwindMerge;

export default ns;

export const createTailwindMerge = ns.createTailwindMerge;
export const extendTailwindMerge = ns.extendTailwindMerge;
// Annotated so declaration emit names tailwind-merge's type rather than its
// non-exported internal `ThemeGetter` (TS4023).
export const fromTheme: typeof TailwindMergeNs.fromTheme = ns.fromTheme;
export const getDefaultConfig: typeof TailwindMergeNs.getDefaultConfig =
  ns.getDefaultConfig;
export const mergeConfigs = ns.mergeConfigs;
export const twJoin = ns.twJoin;
export const twMerge = ns.twMerge;
export const validators = ns.validators;
