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
 * Never written to; the path exists so `import ... from "plumix"` resolves as
 * it would in this app.
 */
const SAMPLES_DIR = join(DOCS_ROOT, ".samples");

/**
 * `parseJsonConfigFileContent` flags the empty `include`, which is deliberate:
 * the samples are the file list.
 */
const NO_INPUTS_FOUND = 18003;

/** One array of complaints per sample, in the order passed in. */
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

  // A broken option or unresolvable lib would otherwise make every sample look
  // clean.
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
 * Extends the shared app config so samples are checked no looser than the
 * reader's project.
 */
function sampleCompilerOptions(): ts.CompilerOptions {
  const parsed = ts.parseJsonConfigFileContent(
    {
      extends: "@plumix/typescript-config/base.json",
      compilerOptions: {
        jsx: "react-jsx",
        // Matches a scaffolded app's ambient types; narrower would reject
        // `process` or Workers bindings the reader's project accepts.
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
 * Thrown, not reported as a finding, so a broken setup does not read as a
 * content problem.
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
 * Sharing parsed lib files across programs is safe only because every program
 * uses one set of options.
 */
const parsedOnce = new Map<string, ts.SourceFile | undefined>();

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
