import type { PackageManager } from "./package-manager.js";
import type { Registry } from "./registry.js";
import { availableAuthMethods } from "./auth-methods.js";
import { ScaffoldError } from "./errors.js";

/**
 * One generated project the scaffold smoke (`scripts/smoke.mjs`) installs,
 * typechecks, builds and boots.
 */
export interface SmokeCombo {
  readonly name: string;
  /** `create-plumix-app` arguments, ahead of the flags every combo shares. */
  readonly args: readonly string[];
  readonly packageManager: PackageManager;
  /** Turn on a second locale and assert every plugin's catalog is staged. */
  readonly secondLocale?: boolean;
  /** Plugin ids the runtime cannot host, so none of their catalogs is expected. */
  readonly excluded?: readonly string[];
  readonly typescript7?: boolean;
}

/**
 * Every runtime times the four shapes, from the registry, so a new runtime or
 * plugin joins the matrix on its own. `-y` on every combo: without it the
 * remaining prompts drop the CLI into the wizard on a terminal. A plugin
 * requiring a capability the runtime lacks is left out, as the scaffolder
 * would refuse it by name, and `excluded` is what says so.
 */
export function planSmokeCombos(registry: Registry): readonly SmokeCombo[] {
  return registry.runtimes.flatMap((runtime) => {
    const { id } = runtime;
    const packageManager = runtime.packageManager ?? "pnpm";
    const supported = (plugin: Registry["plugins"][number]) =>
      (plugin.requires ?? []).every(
        (capability) => runtime.capabilities?.[capability],
      );
    const excluded = registry.plugins
      .filter((plugin) => !supported(plugin))
      .map((plugin) => plugin.id);
    const selected = registry.plugins
      .filter(supported)
      .map((plugin) => plugin.id);
    const authIds = availableAuthMethods(runtime).map((method) => method.id);
    return [
      // `--plugins=` for none: a bare `-y` takes the recommended plugins.
      {
        name: `${id}-blank`,
        args: ["-y", "--runtime", id, "--plugins="],
        packageManager,
      },
      {
        name: `${id}-all-plugins`,
        args: ["-y", "--runtime", id, "-p", selected.join(",")],
        packageManager,
        secondLocale: true,
        excluded,
      },
      // Each auth method is a config fragment written as text, so only a
      // generated project that typechecks and builds proves it still fits.
      {
        name: `${id}-all-auth`,
        args: [
          "-y",
          "--runtime",
          id,
          "--plugins=",
          "--auth",
          authIds.join(","),
        ],
        packageManager,
      },
      // Every plugin, so the published declarations of the whole graph and
      // the islands `plumix/vite` scans all meet the native compiler.
      {
        name: `${id}-typescript-7`,
        args: ["-y", "--runtime", id, "-p", selected.join(",")],
        packageManager,
        typescript7: true,
      },
    ];
  });
}

type Overrides = Readonly<Record<string, string>>;

/** How a combo installs: package.json keys merged in, then the command. */
export interface SmokeInstall {
  readonly manifest: {
    readonly pnpm?: { readonly overrides: Overrides };
    readonly overrides?: Overrides;
  };
  readonly command: readonly [string, ...string[]];
}

/**
 * Point every plumix package at its packed tarball, in the field the combo's
 * package manager reads. Overrides apply transitively across the whole plumix
 * graph, which a direct dependency rewrite would not.
 */
export function planInstall(
  packageManager: PackageManager,
  tarballs: ReadonlyMap<string, string>,
): SmokeInstall {
  const overrides = Object.fromEntries(
    [...tarballs].map(([name, tgz]) => [name, `file:${tgz}`]),
  );
  switch (packageManager) {
    case "pnpm":
      // The project is generated outside the repo, but a workspace above the
      // temp dir would otherwise swallow it.
      return {
        manifest: { pnpm: { overrides } },
        command: ["pnpm", "install", "--ignore-workspace", "--silent"],
      };
    case "bun":
      return {
        manifest: { overrides },
        command: ["bun", "install", "--silent"],
      };
    default:
      throw ScaffoldError.smokePackageManagerUnsupported({ packageManager });
  }
}

/**
 * The fields of a runtime package's `plumix.e2e` block the smoke reads, as
 * the installed package declares them.
 */
export interface RuntimeSmokeFields {
  /** Serves the built output. Runs in a shell, with `PORT` set. */
  readonly start?: string;
  /** Command prefix that runs the `plumix` CLI. */
  readonly cli?: string;
}

/** Shell commands a combo runs after `build`: migrations, then the server. */
export interface SmokeBoot {
  readonly migrate: readonly string[];
  readonly start: string;
}

/**
 * The default `cli` is the package's own bin, which the smoke puts on `PATH`
 * from the project's `node_modules/.bin`.
 */
export function planBoot(
  packageName: string,
  fields: RuntimeSmokeFields,
): SmokeBoot {
  const { start, cli = "plumix" } = fields;
  if (start === undefined) {
    throw ScaffoldError.smokeStartMissing({ packageName });
  }
  // `--local` as post-scaffold passes it: Cloudflare hands it to wrangler, so
  // the migrations land in the local D1 the started server reads rather than on
  // whichever target wrangler defaults to; a SQLite runtime has only one.
  return {
    migrate: [`${cli} migrate generate`, `${cli} migrate apply --local`],
    start,
  };
}
