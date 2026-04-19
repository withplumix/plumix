// Ambient declaration for the `plumix/test` subpath. The real types live
// at `./dist/test/index.d.ts` (via the package `exports` map) and only
// exist after a same-package build; turbo's typecheck intentionally
// doesn't depend on that build, so tsc can't resolve the published
// types at typecheck time.
//
// The module just re-exports everything from @plumix/core/test (which
// IS resolvable, because turbo's typecheck DOES depend on upstream
// builds). Gives the test file real types — not `any` — so
// `no-unsafe-*` lint rules are happy, and drift between this shim and
// the published surface is caught if symbol names change.
declare module "plumix/test" {
  export * from "@plumix/core/test";
}
