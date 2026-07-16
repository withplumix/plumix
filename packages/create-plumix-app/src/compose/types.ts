/** Placeholder token in descriptor strings, replaced with the project name. */
export const PROJECT_NAME_TOKEN = "__PROJECT_NAME__";

/**
 * A runtime's scaffold contributions, read from its `plumix.scaffold`
 * block. The runtime owns everything runtime-specific: config imports and
 * slots, the passkey deploy-origin, dependencies, and whole files (e.g. a
 * Cloudflare `wrangler.jsonc`). Strings may embed {@link PROJECT_NAME_TOKEN}.
 */
export interface RuntimeDescriptor {
  readonly id: string;
  readonly label: string;
  /** One-line summary, shown in the runtime picker (added in a later slice). */
  readonly description?: string;
  /** Full `import ... from "..."` statements to prepend to the config. */
  readonly imports: readonly string[];
  /** Top-level `plumix({ ... })` slots, e.g. `runtime`, `database`. */
  readonly configSlots: Readonly<Record<string, string>>;
  /** Spread expression merged into the passkey block (deploy origin). */
  readonly authOrigin?: string;
  /** One-line comment emitted above {@link authOrigin}. */
  readonly authOriginComment?: string;
  /** Dependencies this runtime adds to the app. */
  readonly deps: Readonly<Record<string, string>>;
  readonly devDeps: Readonly<Record<string, string>>;
  /** Whole files the runtime contributes, keyed by relative path. */
  readonly files: Readonly<Record<string, string>>;
  /**
   * Named runtime capabilities a plugin can require (e.g. `storage`).
   * Fulfilling one contributes its imports, config slots, and wrangler
   * bindings — the seam that lets a runtime-agnostic plugin like media
   * wire object storage without naming Cloudflare.
   */
  readonly capabilities?: Readonly<Record<string, Contribution>>;
  /** Auth methods this runtime adds to the picker (e.g. Cloudflare Access). */
  readonly authMethods?: Readonly<Record<string, RawAuthMethod>>;
}

/** The authored shape of an auth method in a `plumix.scaffold` block. */
export interface RawAuthMethod {
  readonly label: string;
  readonly description?: string;
  readonly comment?: string;
  readonly imports?: readonly string[];
  /** A single-line `key: value` entry spliced into the `auth({ ... })` call. */
  readonly authEntry: string;
  /** Top-level config slots the method needs (e.g. magic link's mailer). */
  readonly configSlots?: Readonly<Record<string, string>>;
  /** Secret binding names → `.dev.vars` + a PlumixEnv augmentation. */
  readonly envVars?: readonly string[];
}

/** A resolved auth method (a core method or a runtime-contributed one). */
export interface AuthMethodDescriptor extends RawAuthMethod {
  readonly id: string;
}

/**
 * A bundle of contributions merged into the composed project: config
 * imports and top-level slots, plus wrangler binding patches. Shared by
 * plugin descriptors and runtime capabilities.
 */
export interface Contribution {
  readonly imports?: readonly string[];
  readonly configSlots?: Readonly<Record<string, string>>;
  /** Top-level wrangler.jsonc keys to merge (arrays append). */
  readonly wrangler?: Readonly<Record<string, unknown>>;
}

/** A plugin's scaffold contributions, from its `plumix.scaffold` block. */
export interface PluginDescriptor extends Contribution {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly category?: string;
  /** Expression placed in the config `plugins: [...]` array. */
  readonly registration: string;
  /** Runtime capabilities this plugin needs (e.g. `["storage"]`). */
  readonly requires?: readonly string[];
  /** App dependencies, derived from the plugin's package + peers. */
  readonly deps: Readonly<Record<string, string>>;
}

/** A fully resolved set of choices ready to compose into a project. */
export interface Selection {
  readonly projectName: string;
  readonly runtime: RuntimeDescriptor;
  readonly plugins: readonly PluginDescriptor[];
  /** Optional auth methods layered on the always-present passkey. */
  readonly authMethods: readonly AuthMethodDescriptor[];
}

export function fillProjectName(value: string, projectName: string): string {
  return value.replaceAll(PROJECT_NAME_TOKEN, projectName);
}
