import type { RuntimeTargetOptions, TargetOptionValues } from "plumix/cli";
import { loadOnce } from "plumix/support";

import type {
  D1BindingEntry,
  LoadedWranglerConfig,
} from "../wrangler-config.js";
import { CloudflareCliError } from "./errors.js";

export const D1_TARGET_OPTIONS: RuntimeTargetOptions = {
  production: {
    type: "boolean",
    description:
      "The production D1: env.production's if the wrangler config has one, else the top level's",
  },
  preview: {
    type: "boolean",
    description:
      "The Worker Previews D1 of the environment, production's alone",
  },
  env: {
    type: "string",
    description: "The D1 of a wrangler environment (env.<name>)",
  },
};

/**
 * A deployed database as wrangler names it: an environment, and whether its
 * Worker Previews one. The shape of `cf`'s `ctx.mode` and `ctx.isPreview`.
 */
export interface DeployTarget {
  readonly environment: string;
  readonly preview: boolean;
}

const PRODUCTION = "production";

/**
 * Null without a target option: the local database. `CLOUDFLARE_ENV` names
 * the environment only where no option does, as in wrangler.
 */
export function deployTargetOf(
  values: TargetOptionValues,
  cloudflareEnv: string | undefined,
): DeployTarget | null {
  const production = values.production === true;
  const preview = values.preview === true;
  const env = typeof values.env === "string" ? values.env : undefined;
  if (production && env !== undefined) {
    throw CloudflareCliError.migrateTargetConflict({ env });
  }
  if (!production && !preview && env === undefined) return null;
  if (env !== undefined) return { environment: env, preview };
  if (production || cloudflareEnv === undefined || cloudflareEnv === "") {
    return { environment: PRODUCTION, preview };
  }
  return { environment: cloudflareEnv, preview };
}

/** The block of a wrangler config whose `d1_databases` a target reaches. */
export interface D1Block {
  /** Where it sits in the config: `the top level`, `env.qa.previews`. */
  readonly path: string;
  /** Which database it is and how it was chosen: `production (top level)`. */
  readonly summary: string;
  /** Whether it is the top-level `previews`, every branch's by default. */
  readonly sharedPreviews: boolean;
  readonly d1Databases: readonly D1BindingEntry[];
  readonly compatibilityDate?: string;
  readonly accountId?: string;
}

function entriesOf(
  databases: readonly D1BindingEntry[] | undefined,
): readonly D1BindingEntry[] {
  return (databases ?? []).map(({ binding, database_name, database_id }) => ({
    ...(binding === undefined ? {} : { binding }),
    ...(database_name === undefined ? {} : { database_name }),
    ...(database_id === undefined ? {} : { database_id }),
  }));
}

/** The part of wrangler's resolved config a target reads. */
interface ResolvedWranglerConfig {
  readonly d1_databases?: readonly D1BindingEntry[];
  readonly previews?: { readonly d1_databases?: readonly D1BindingEntry[] };
  readonly compatibility_date?: string;
  readonly account_id?: string;
}

interface WranglerConfigReader {
  unstable_readConfig(
    args: { config: string; env: string },
    options: { hideWarnings: boolean },
  ): ResolvedWranglerConfig;
}

const loadWrangler = loadOnce(() => import("wrangler"));

async function wranglerConfigReader(): Promise<WranglerConfigReader> {
  // wrangler's declaration types its config from @cloudflare/workers-utils,
  // which it bundles without publishing the types, so it resolves to nothing.
  return await loadWrangler();
}

/**
 * Which blocks exist is read off `config`; the block itself through
 * wrangler's own reader, so `env` and the inheritance of `previews` resolve
 * as `wrangler deploy` and `wrangler preview` resolve them.
 */
export async function resolveD1Block(
  configPath: string,
  config: LoadedWranglerConfig,
  target: DeployTarget,
): Promise<D1Block> {
  const environment = config.environments.find(
    (env) => env.name === target.environment,
  );
  const named = target.environment !== PRODUCTION || environment !== undefined;
  const label = target.preview ? "preview" : target.environment;
  const envPath = `env.${target.environment}`;
  if (named && environment === undefined) {
    const path = target.preview ? `${envPath}.previews` : envPath;
    return {
      path,
      summary: `${label} (${path})`,
      sharedPreviews: false,
      d1Databases: [],
    };
  }
  const reader = await wranglerConfigReader();
  // An empty env is wrangler's top level; `undefined` would read CLOUDFLARE_ENV.
  const resolved = reader.unstable_readConfig(
    { config: configPath, env: named ? target.environment : "" },
    { hideWarnings: true },
  );
  const settings = {
    ...(resolved.compatibility_date === undefined
      ? {}
      : { compatibilityDate: resolved.compatibility_date }),
    ...(resolved.account_id === undefined
      ? {}
      : { accountId: resolved.account_id }),
  };
  if (!target.preview) {
    return {
      path: named ? envPath : "the top level",
      summary: `${label} (${named ? envPath : "top level"})`,
      sharedPreviews: false,
      d1Databases: entriesOf(resolved.d1_databases),
      ...settings,
    };
  }
  const ownPreviews = environment?.previews !== undefined;
  return {
    path: ownPreviews ? `${envPath}.previews` : "previews",
    summary: `${label} (${previewsProvenance(ownPreviews, named, envPath)})`,
    sharedPreviews: !ownPreviews,
    d1Databases: entriesOf(resolved.previews?.d1_databases),
    ...settings,
  };
}

function previewsProvenance(
  ownPreviews: boolean,
  named: boolean,
  envPath: string,
): string {
  if (ownPreviews) return `${envPath}.previews`;
  if (named) return `${envPath}, previews inherited from top level`;
  return "top-level previews";
}
