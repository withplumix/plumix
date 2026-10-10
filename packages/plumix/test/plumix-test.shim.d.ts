// The real types exist only after a same-package build, which turbo's
// typecheck doesn't depend on; this re-exports the resolvable core types.
//
// eslint-disable-next-line no-restricted-syntax -- ambient declaration of the `plumix/test` subpath so tsc can resolve it, not a registry augmentation (the issue #1691 guard targets the latter)
declare module "plumix/test" {
  export * from "@plumix/core/test";
}

// eslint-disable-next-line no-restricted-syntax -- ambient declaration of the `plumix/test/conformance` subpath so tsc can resolve it, not a registry augmentation (the issue #1691 guard targets the latter)
declare module "plumix/test/conformance" {
  export * from "@plumix/core/test/conformance";
}
