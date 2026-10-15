import { describe, expectTypeOf, test } from "vitest";

import type { OAuthProviderOf, OAuthProvidersOf } from "./registry.js";
import { auth } from "../config.js";
import { github } from "../oauth/providers/github.js";
import { google } from "../oauth/providers/google.js";

const _config = {
  auth: auth({
    passkey: {
      rpName: "Plumix",
      rpId: "cms.example",
      origin: "https://cms.example",
    },
    oauth: {
      providers: {
        github: github({ clientId: "id", clientSecret: "secret" }),
        google: google({ clientId: "id", clientSecret: "secret" }),
      },
    },
  }),
};

/** What the scaffolded `plumix.config.ts` writes into `declare module "plumix"`. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the augmentation's shape
interface ConfiguredProviders extends OAuthProvidersOf<typeof _config> {}

/** A site that never added the line. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- an augmentation target
interface UnconfiguredProviders {}

describe("an OAuth provider's type", () => {
  test("is one of the config's provider keys once the registry is derived from it", () => {
    expectTypeOf<OAuthProviderOf<ConfiguredProviders>>().toEqualTypeOf<
      "github" | "google"
    >();
    const start = (_provider: OAuthProviderOf<ConfiguredProviders>) =>
      _provider;
    start("github");
    // @ts-expect-error -- not a configured provider
    start("nope");
  });

  test("is any string while the registry is empty", () => {
    expectTypeOf<
      OAuthProviderOf<UnconfiguredProviders>
    >().toEqualTypeOf<string>();
  });
});
