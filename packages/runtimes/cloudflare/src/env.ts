/// <reference types="@cloudflare/workers-types" />

declare module "plumix" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augments `PlumixEnv` with the Worker's bindings
  interface PlumixEnv extends Cloudflare.Env {}
}

export {};
