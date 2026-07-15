// The Durable Object class lives on its own subpath because it imports
// `cloudflare:workers` (a workerd-only virtual module). The generated Worker
// re-exports it via the worker-exports seam, but config helpers must never
// pull it into the jiti config-load graph. Keep this subpath free of anything
// the config (`demoPreset` etc.) needs.
export { DemoDB } from "./demo-db.js";
export type { DemoQueryResult, DemoStatement } from "./demo-db.js";
