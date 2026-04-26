import { getRuntime } from "./runtime.js";

const ns = getRuntime().orpcClientFetch;

export default ns;

export const LinkFetchClient = ns.LinkFetchClient;
export const RPCLink = ns.RPCLink;
