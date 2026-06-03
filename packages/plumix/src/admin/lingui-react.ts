import { getRuntime } from "./runtime.js";

const ns = getRuntime().linguiReact;

export default ns;

export const I18nProvider = ns.I18nProvider;
export const LinguiContext = ns.LinguiContext;
export const Trans = ns.Trans;
export const useLingui = ns.useLingui;
