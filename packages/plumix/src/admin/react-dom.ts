import { getRuntime } from "./runtime.js";

const ns = getRuntime().reactDom;

export default ns;

export const createPortal = ns.createPortal;
export const flushSync = ns.flushSync;
export const preconnect = ns.preconnect;
export const prefetchDNS = ns.prefetchDNS;
export const preinit = ns.preinit;
export const preinitModule = ns.preinitModule;
export const preload = ns.preload;
export const preloadModule = ns.preloadModule;
export const requestFormReset = ns.requestFormReset;
export const unstable_batchedUpdates = ns.unstable_batchedUpdates;
export const useFormState = ns.useFormState;
export const useFormStatus = ns.useFormStatus;
export const version = ns.version;
