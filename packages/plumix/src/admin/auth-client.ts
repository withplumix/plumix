// The host admin's `authClient`, so a plugin's method half registers on, and
// a plugin page signs in through, the one session store the admin holds.
import { getRuntime } from "./runtime.js";

const ns = getRuntime().authClient;

export default ns;

export const authClient = ns.authClient;
export const defineAuthMethodClient = ns.defineAuthMethodClient;
export const registerAuthMethodClients = ns.registerAuthMethodClients;
