import type { Code, Root, RootContent } from "mdast";

import type { ContentFile } from "./content-tree";
import type { Finding } from "./finding";
import type { SampleDiagnostic } from "./sample-program";
import { typeCheckSamples } from "./sample-program";

// The Shiki alias `typescript` is listed so a writer who uses it still gets a
// checked sample.
const TYPESCRIPT_FENCES = new Set(["ts", "tsx", "typescript"]);

// Without an opt-out a page could never show a mistake or an anti-pattern.
const OPT_OUT = "no-typecheck";

interface Sample {
  readonly file: string;
  /**
   * 1-based; opted-out blocks are counted so a sample's number does not shift.
   */
  readonly ordinal: number;
  readonly jsx: boolean;
  readonly code: string;
}

/**
 * Checks fragments as well as pages: a partial's samples render inside every
 * page that imports it.
 */
export function checkCodeSamples(files: readonly ContentFile[]): Finding[] {
  return files.flatMap(checkFile);
}

// One program per file, so one file's `declare module "plumix"` augmentation
// cannot decide whether another file's samples compile.
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

// Nested fences too: a sample inside `<Tabs>` or a list item is still copied by
// readers.
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
