export interface CompileCatalogsOptions {
  /** Package root: lingui reads its config from here, and `--dts` writes
   *  beside the catalogs in its `locales/`. */
  readonly cwd: string;
  /** Path to `@lingui/cli`'s `lingui.js`, resolved by the caller. */
  readonly linguiBin: string;
  /** Extra arguments for `lingui compile`, after `--namespace es`. */
  readonly args?: readonly string[];
  /** Write a `.d.mts` stub beside each compiled `<locale>.mjs`. */
  readonly dts?: boolean;
}

export type CompileCatalogsResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Runs `lingui compile --namespace es` and fails on a catalog parse error,
 *  which lingui only warns about. Never fails on a missing translation, and
 *  never exits the process — the caller decides what a failure means. */
export declare function compileCatalogs(
  options: CompileCatalogsOptions,
): Promise<CompileCatalogsResult>;

/** The calling package's own `@lingui/cli` first, then core's. */
export declare function resolveLinguiBin(cwd: string): string | null;

/** Compiles the catalogs of the package at `cwd` as a process would: sets
 *  `process.exitCode` on failure rather than throwing. */
export declare function runCompileCatalogs(
  cwd: string,
  argv: readonly string[],
): Promise<void>;
