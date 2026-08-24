import type { Code, Root, RootContent } from "mdast";

import type { ContentFile } from "./content-tree";
import type { Finding } from "./finding";
import type { SampleDiagnostic } from "./sample-program";
import { typeCheckSamples } from "./sample-program";

/**
 * Fence languages that hold TypeScript. The Shiki aliases are here on purpose:
 * a writer who reaches for ```` ```typescript ```` would otherwise get a sample
 * nothing checks, which is the exact hole this check exists to close.
 */
const TYPESCRIPT_FENCES = new Set(["ts", "tsx", "typescript"]);

/**
 * Marks a fence as deliberately unfit to compile — an anti-pattern being shown,
 * or an error the prose is about. Required rather than a nicety: without it a
 * page cannot show a mistake at all.
 */
const OPT_OUT = "no-typecheck";

interface Sample {
  /** Path of the file the fence sits in, relative to the content root. */
  readonly file: string;
  /**
   * 1-based position among the file's TypeScript blocks. Opted-out blocks are
   * counted, so a sample keeps its number whether or not its neighbours are
   * checked.
   */
  readonly ordinal: number;
  readonly jsx: boolean;
  readonly code: string;
}

/**
 * Report every TypeScript sample that no longer compiles against the types the
 * package publishes. On a pre-1.0 surface a renamed export or a changed
 * signature leaves a sample that reads fine and does not work, and a reader who
 * copies it cannot tell whether they mis-copied it or the API moved.
 *
 * Fragments as well as pages. A partial has no URL, but a sample written in
 * one renders inside every page that imports it — so it reaches a reader
 * exactly as a sample on a page does, and rots exactly as readily.
 */
export function checkCodeSamples(files: readonly ContentFile[]): Finding[] {
  return files.flatMap(checkFile);
}

/**
 * One program per file. A sample carrying `declare module "plumix"` — which is
 * how this project's type augmentation is written, and therefore how its docs
 * will show it — is visible to every other sample compiled beside it. Kept to
 * the file, that is the narrative a reader reads top to bottom; spread across
 * the tree, one file's augmentation would quietly decide whether another's
 * sample compiles.
 */
function checkFile(file: ContentFile): Finding[] {
  const samples = readSamples(file);
  const complaints = typeCheckSamples(samples);

  return samples.flatMap((sample, index) => {
    const failures = complaints[index];
    if (failures.length === 0) return [];

    return [
      {
        file: sample.file,
        rule: "code-samples/does-not-compile",
        message: describeFailure(sample, failures),
      },
    ];
  });
}

function describeFailure(
  sample: Sample,
  failures: readonly SampleDiagnostic[],
): string {
  const fence = sample.jsx ? "tsx" : "ts";

  return [
    `Sample ${String(sample.ordinal)} does not type-check against the published types. Fix it, or fence it as \`${fence} ${OPT_OUT}\` if it is meant not to compile.`,
    // Numbered from the fence, not from the top of the page: the sample is
    // what the reader copies, and it is what the writer edits.
    ...failures.map(
      ({ line, message }) => `sample line ${String(line)}: ${message}`,
    ),
  ].join("\n");
}

function readSamples(file: ContentFile): Sample[] {
  // Reported by `checkParsable`.
  if (file.mdast === undefined) return [];

  const samples: Sample[] = [];
  let ordinal = 0;

  for (const block of fencedBlocks(file.mdast)) {
    const language = block.lang?.toLowerCase();
    if (language === undefined || !TYPESCRIPT_FENCES.has(language)) continue;

    ordinal += 1;
    if (optedOut(block)) continue;

    samples.push({
      file: file.path,
      ordinal,
      jsx: language === "tsx",
      code: block.value,
    });
  }

  return samples;
}

/**
 * Every fence on the page, not only the top-level ones — a sample inside
 * `<Tabs>` or a list item is still a sample a reader copies.
 */
function* fencedBlocks(node: Root | RootContent): Generator<Code> {
  if (node.type === "code") {
    yield node;
    return;
  }
  if (!("children" in node)) return;
  for (const child of node.children) yield* fencedBlocks(child);
}

function optedOut(block: Code): boolean {
  return block.meta?.split(/\s+/).includes(OPT_OUT) === true;
}
