export function fail(): never {
  throw new Error("boom");
}

declare module "plumix" {}

declare module "@plumix/core" {}
