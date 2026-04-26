import { getRuntime } from "./runtime.js";

const ns = getRuntime().reactJsxRuntime;

export const Fragment = ns.Fragment;
export const jsx = ns.jsx;
export const jsxs = ns.jsxs;
