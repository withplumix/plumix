/// <reference types="@cloudflare/workers-types" />

declare module "plumix" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface PlumixEnv extends Cloudflare.Env {}
}

export {};
