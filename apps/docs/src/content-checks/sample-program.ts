import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** One extracted sample, ready to compile. */
export interface SampleSource {
  /** The fenced block's contents, verbatim. */
  readonly code: string;
  /** Whether the block was fenced as `tsx`, which compiles as `.tsx`. */
  readonly jsx: boolean;
}

/** One compiler complaint about one sample. */
export interface SampleDiagnostic {
  /** 1-based line within the sample. */
  readonly line: number;
  /** The compiler's own message, flattened to one line. */
  readonly message: string;
}

const DOCS_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Where samples pretend to live. Nothing is written here: the files are served
 * from memory, and the path exists only so that `import ... from "plumix"`
 * resolves the same way it would in a file the reader wrote inside this app.
 */
const SAMPLES_DIR = join(DOCS_ROOT, ".samples");

/**
 * `parseJsonConfigFileContent` reports an empty `include` as a problem. Here it
 * is the point: the file list is the samples, not a glob.
 */
const NO_INPUTS_FOUND = 18003;

/**
 * Compile one file's samples in one program and return what the compiler said
 * about each — one array of complaints per sample, in the order passed in.
 *
 * Samples are type-checked, never executed; the README carries why.
 */
export function typeCheckSamples(
  samples: readonly SampleSource[],
): SampleDiagnostic[][] {
  if (samples.length === 0) return [];

  // Named by position, so no two samples can collide on a path. The name
  // reaches no reader: findings are addressed by page and ordinal.
  const compiled = samples.map((sample, index) => ({
    fileName: join(
      SAMPLES_DIR,
      `sample-${String(index)}.${sample.jsx ? "tsx" : "ts"}`,
    ),
    code: sample.code,
  }));
  const files = new Map(compiled.map((file) => [file.fileName, file.code]));

  const options = sampleCompilerOptions();
  const program = ts.createProgram(
    [...files.keys()],
    options,
    virtualHost(options, files),
  );

  // A broken option combination or an unresolvable lib would otherwise leave
  // every sample looking clean — the one failure this check cannot afford,
  // since it is indistinguishable from a run that found nothing wrong.
  const setup = [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
  ];
  if (setup.length > 0)
    throw SampleProgramError.unusableProgram(flatten(setup));

  return compiled.map(({ fileName }) => {
    const source = program.getSourceFile(fileName);
    // The host serves every root name from memory, so a missing one means the
    // host is broken rather than the sample being clean.
    if (source === undefined) throw SampleProgramError.missingSample(fileName);

    return [
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    ].map((diagnostic) => ({
      line:
        source.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    }));
  });
}

/**
 * The options a Plumix app is built with, taken from the shared config the
 * apps in this repo extend rather than restated here — a sample checked under
 * looser settings than the reader's own project is a sample that passes here
 * and fails there.
 */
function sampleCompilerOptions(): ts.CompilerOptions {
  const parsed = ts.parseJsonConfigFileContent(
    {
      extends: "@plumix/typescript-config/base.json",
      compilerOptions: {
        jsx: "react-jsx",
        // The ambient types a scaffolded app declares (see the `TSCONFIG`
        // literal in create-plumix-app). Narrowing them here would make this
        // check stricter than the project the reader pastes into, and a sample
        // rejected for using `process` or a Workers binding is a false alarm
        // that teaches writers to reach for the opt-out.
        types: ["node", "@cloudflare/workers-types", "react"],
        // Off because the inherited `tsBuildInfoFile` is the one `pnpm
        // typecheck` writes, not for speed.
        incremental: false,
      },
      include: [],
    },
    ts.sys,
    DOCS_ROOT,
  );

  const errors = parsed.errors.filter(
    (error) => error.code !== NO_INPUTS_FOUND,
  );
  if (errors.length > 0) {
    throw SampleProgramError.unreadableCompilerOptions(flatten(errors));
  }

  return parsed.options;
}

function flatten(diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, " "),
    )
    .join(" ");
}

/**
 * This app's own setup is broken, rather than any page being wrong — so the run
 * stops instead of turning it into a finding, which would read as a content
 * problem for whichever page happened to be first. Named per the errors
 * convention (#232).
 */
class SampleProgramError extends Error {
  static {
    SampleProgramError.prototype.name = "SampleProgramError";
  }

  private constructor(message: string) {
    super(message);
  }

  static unreadableCompilerOptions(detail: string): SampleProgramError {
    return new SampleProgramError(
      `Could not read the sample compiler options from \`@plumix/typescript-config/base.json\`: ${detail}`,
    );
  }

  static unusableProgram(detail: string): SampleProgramError {
    return new SampleProgramError(
      `The sample program is not usable, so no sample was really checked: ${detail}`,
    );
  }

  static missingSample(fileName: string): SampleProgramError {
    return new SampleProgramError(
      `The sample program dropped \`${fileName}\`, so that sample was not checked.`,
    );
  }
}

/**
 * The lib and `.d.ts` files behind the samples, parsed once and shared by every
 * page's program. All programs here run on one set of options, which is the
 * condition under which a parsed file may be reused across them.
 */
const parsedOnce = new Map<string, ts.SourceFile | undefined>();

/** Serves the samples from memory and everything else from disk. */
function virtualHost(
  options: ts.CompilerOptions,
  files: ReadonlyMap<string, string>,
): ts.CompilerHost {
  const disk = ts.createCompilerHost(options, false);

  return {
    ...disk,
    fileExists: (fileName) => files.has(fileName) || disk.fileExists(fileName),
    readFile: (fileName) => files.get(fileName) ?? disk.readFile(fileName),
    getSourceFile: (fileName, languageVersion, onError, shouldCreate) => {
      const code = files.get(fileName);
      if (code !== undefined)
        return ts.createSourceFile(fileName, code, languageVersion);

      if (!parsedOnce.has(fileName)) {
        parsedOnce.set(
          fileName,
          disk.getSourceFile(fileName, languageVersion, onError, shouldCreate),
        );
      }
      return parsedOnce.get(fileName);
    },
  };
}
