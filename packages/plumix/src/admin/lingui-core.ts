import { getRuntime } from "./runtime.js";

const ns = getRuntime().linguiCore;

export default ns;

export const i18n = ns.i18n;
export const setupI18n = ns.setupI18n;
export const formats = ns.formats;
export const I18n = ns.I18n;
