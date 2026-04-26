import { getRuntime } from "./runtime.js";

const ns = getRuntime().reactDomClient;

export default ns;

export const createRoot = ns.createRoot;
export const hydrateRoot = ns.hydrateRoot;
