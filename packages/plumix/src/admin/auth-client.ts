import { getRuntime } from "./runtime.js";

const ns = getRuntime().authClient;

export default ns;

export const authClient = ns.authClient;
export const defineAuthMethodClient = ns.defineAuthMethodClient;
export const registerAuthMethodClients = ns.registerAuthMethodClients;
