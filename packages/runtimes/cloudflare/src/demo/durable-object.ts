// Own subpath: it imports workerd-only `cloudflare:workers`, which must never
// reach the jiti config-load graph.
export { DemoDB } from "./demo-db.js";
export type { DemoQueryResult, DemoStatement } from "./demo-db.js";
