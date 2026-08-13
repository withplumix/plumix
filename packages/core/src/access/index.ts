// The developer-facing access-policy primitives. The gate wiring
// (`policyForMatch` / `gateToResponse`) is framework-internal — the dispatcher
// imports it from `./gate.js` directly rather than through this barrel.
export * from "./policy.js";
