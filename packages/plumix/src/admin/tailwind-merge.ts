// Shares the host admin shell's `tailwind-merge` instance with plugin chunks
// instead of bundling a copy.
import type * as TailwindMergeNs from "tailwind-merge";

import { getRuntime } from "./runtime.js";

const ns = getRuntime().tailwindMerge;

export default ns;

export const createTailwindMerge = ns.createTailwindMerge;
export const extendTailwindMerge = ns.extendTailwindMerge;
/**
 * Annotated so declaration emit names tailwind-merge's type rather than its
 * non-exported internal `ThemeGetter` (TS4023).
 */
export const fromTheme: typeof TailwindMergeNs.fromTheme = ns.fromTheme;
export const getDefaultConfig: typeof TailwindMergeNs.getDefaultConfig =
  ns.getDefaultConfig;
export const mergeConfigs = ns.mergeConfigs;
export const twJoin = ns.twJoin;
export const twMerge = ns.twMerge;
export const validators = ns.validators;
