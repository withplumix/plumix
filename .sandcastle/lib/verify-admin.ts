import type { Executor, GateRun } from "./gates.js";
import { taggedBlock } from "./agent.js";

/** Under `.cache`, which git ignores, so a read-only phase that finds it there still leaves the tree clean. */
const VERIFY_ADMIN_DIR = ".cache/sandcastle/verify-admin";
const DECLARED_FILE = `${VERIFY_ADMIN_DIR}/declared.txt`;
const EVIDENCE_FILE = `${VERIFY_ADMIN_DIR}/evidence.json`;
const RUNS_DIR = `${VERIFY_ADMIN_DIR}/runs`;

const BUILD = "pnpm exec turbo run build --output-logs=errors-only";
const COMMAND_PREFIX = "pnpm verify:admin ";
const OPT_OUT = /^none:\s*(.*)$/i;
const SHELL_SYNTAX = /[;&|`$<>\\]/;
const BLOCK = /<!-- verify-admin -->[\s\S]*?<!-- \/verify-admin -->/;
const LISTED_COMMAND = /^- `(pnpm verify:admin [^`]+)` — /;
const LISTED_OPT_OUT = /^`verify:admin` not run: (.+)$/;
const SUMMARY_LABELS =
  /^(final URL|redirected|expected|console|requests|axe|steps)\s/;

export type Verification =
  | { readonly kind: "commands"; readonly commands: readonly string[] }
  | { readonly kind: "none"; readonly reason: string }
  | { readonly kind: "invalid"; readonly problem: string };

interface VerificationRun {
  readonly command: string;
  readonly exitCode: number;
  readonly summary: string;
  readonly report: string;
  readonly screenshots: readonly string[];
}

export interface VerificationEvidence {
  readonly head: string;
  readonly declared: Exclude<Verification, { kind: "invalid" }>;
  readonly runs: readonly VerificationRun[];
}

const HOW_TO_DECLARE = `End your message with a <verify-admin> block: one \`pnpm verify:admin\` command per line, without \`--out\` (the harness picks it), or \`none: <why no page shows this change>\` alone.`;

function problemWith(line: string): string | null {
  if (!line.startsWith(COMMAND_PREFIX))
    return `\`${line}\` is not a \`pnpm verify:admin\` command.`;
  if (SHELL_SYNTAX.test(line))
    return `\`${line}\` holds shell syntax; declare one plain verify:admin run per line.`;
  if (/(^|\s)--out(\s|=|$)/.test(line))
    return `\`${line}\` sets --out; the harness writes each run's evidence where the coordinator keeps it.`;
  return null;
}

export function parseVerification(block: string): Verification {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const optOut = lines.length === 1 ? lines[0]?.match(OPT_OUT) : null;
  if (optOut) {
    const reason = optOut[1]?.trim() ?? "";
    return reason
      ? { kind: "none", reason }
      : {
          kind: "invalid",
          problem: "An opt-out needs its reason after `none:`.",
        };
  }
  if (lines.length === 0)
    return { kind: "invalid", problem: "The <verify-admin> block is empty." };
  const problems = lines.flatMap((line) => problemWith(line) ?? []);
  return problems.length > 0
    ? { kind: "invalid", problem: problems.join("\n") }
    : { kind: "commands", commands: lines };
}

export const readVerificationTag = (stdout: string): string | null =>
  taggedBlock(stdout, "verify-admin") || null;

const quoted = (text: string): string => `'${text.replace(/'/g, "'\\''")}'`;

const writeInSandbox = async (
  sandbox: Executor,
  path: string,
  content: string,
): Promise<void> => {
  await sandbox.exec(
    `mkdir -p ${VERIFY_ADMIN_DIR} && printf '%s\\n' ${quoted(content)} > ${path}`,
  );
};

/** Every later gate in this sandbox reads it, so a fixer's declaration replaces the implementer's. */
export const declareVerification = (
  sandbox: Executor,
  block: string,
): Promise<void> => writeInSandbox(sandbox, DECLARED_FILE, block.trim());

export function summaryLineOf(stdout: string): string {
  const lines = stdout
    .split("\n")
    .filter((line) => SUMMARY_LABELS.test(line))
    .map((line) => line.replace(/\s+/g, " ").trim());
  return lines.join("; ") || "no summary printed";
}

const headOf = async (sandbox: Executor): Promise<string> =>
  (await sandbox.exec("git rev-parse HEAD")).stdout.trim();

const runOne = async (
  sandbox: Executor,
  command: string,
  index: number,
): Promise<VerificationRun & { readonly output: string }> => {
  const out = `${RUNS_DIR}/${index + 1}`;
  const { exitCode, stdout, stderr } = await sandbox.exec(
    `${command} --out ${out}`,
  );
  const files = (await sandbox.exec(`ls -1 ${out}`)).stdout
    .split("\n")
    .map((file) => file.trim());
  return {
    command,
    exitCode,
    summary: summaryLineOf(stdout),
    report: `${out}/report.json`,
    screenshots: files
      .filter((file) => file.endsWith(".png"))
      .map((file) => `${out}/${file}`),
    output: `$ ${command}\n${stdout}${stderr}`,
  };
};

/**
 * The verify-admin gate: reruns what the branch declared on the commit in the
 * sandbox, after a build, since the playground serves `dist/`.
 */
export async function runDeclaredVerification(
  sandbox: Executor,
): Promise<GateRun> {
  await sandbox.exec(`rm -rf ${RUNS_DIR} ${EVIDENCE_FILE}`);
  const declaredFile = await sandbox.exec(`cat ${DECLARED_FILE}`);
  if (declaredFile.exitCode !== 0)
    return {
      exitCode: 1,
      output: `This branch changes an admin or render path and declared no verification. ${HOW_TO_DECLARE}`,
    };
  const declared = parseVerification(declaredFile.stdout);
  if (declared.kind === "invalid")
    return {
      exitCode: 1,
      output: `${declared.problem}\n\n${HOW_TO_DECLARE}`,
    };

  const head = await headOf(sandbox);
  if (declared.kind === "none") {
    await writeEvidence(sandbox, { head, declared, runs: [] });
    return {
      exitCode: 0,
      output: `No verify:admin run: ${declared.reason}`,
      artifacts: VERIFY_ADMIN_DIR,
    };
  }

  const build = await sandbox.exec(BUILD);
  if (build.exitCode !== 0)
    return {
      exitCode: build.exitCode,
      output: `$ ${BUILD}\n${build.stdout}${build.stderr}`,
    };
  const runs: (VerificationRun & { readonly output: string })[] = [];
  for (const [index, command] of declared.commands.entries())
    runs.push(await runOne(sandbox, command, index));
  await writeEvidence(sandbox, {
    head,
    declared,
    runs: runs.map(({ output: _output, ...run }) => run),
  });

  const failed = runs.filter(({ exitCode }) => exitCode !== 0);
  return {
    exitCode: failed.length > 0 ? 1 : 0,
    output:
      failed.length > 0
        ? failed.map(({ output }) => output).join("\n\n")
        : runs
            .map(({ command, summary }) => `${command}\n  ${summary}`)
            .join("\n"),
    artifacts: VERIFY_ADMIN_DIR,
  };
}

const writeEvidence = (
  sandbox: Executor,
  evidence: VerificationEvidence,
): Promise<void> =>
  writeInSandbox(sandbox, EVIDENCE_FILE, JSON.stringify(evidence));

const readEvidence = async (
  sandbox: Executor,
): Promise<VerificationEvidence | null> => {
  const { exitCode, stdout } = await sandbox.exec(`cat ${EVIDENCE_FILE}`);
  if (exitCode !== 0) return null;
  try {
    return JSON.parse(stdout) as VerificationEvidence;
  } catch {
    return null;
  }
};

/** The gate's evidence when it ran on the commit in the sandbox; a later commit has none until the gate runs again. */
export async function publishedVerification(
  sandbox: Executor,
): Promise<VerificationEvidence | null> {
  const evidence = await readEvidence(sandbox);
  return evidence && evidence.head === (await headOf(sandbox))
    ? evidence
    : null;
}

const asReviewedRuns = ({ head, declared, runs }: VerificationEvidence) => {
  if (declared.kind === "none")
    return `The implementer declared that no verify:admin run can show this change: "${declared.reason}"`;
  const listed = runs.map(
    ({ command, exitCode, summary, report, screenshots }, index) =>
      `${index + 1}. \`${command}\` exited ${exitCode}: ${summary}\n   report: ${report}\n   screenshots: ${screenshots.join(", ")}`,
  );
  return `The harness ran each declared verify:admin command on ${head}:\n\n${listed.join("\n")}`;
};

export async function verificationForReview(
  sandbox: Executor,
): Promise<string> {
  const evidence = await publishedVerification(sandbox);
  if (evidence) return asReviewedRuns(evidence);
  const declaredFile = await sandbox.exec(`cat ${DECLARED_FILE}`);
  if (declaredFile.exitCode !== 0)
    return "No verify:admin run is declared for this branch.";
  const declared = parseVerification(declaredFile.stdout);
  if (declared.kind === "none")
    return `The implementer declared that no verify:admin run can show this change: "${declared.reason}"`;
  if (declared.kind === "invalid")
    return `No verify:admin run is declared in a form the harness reads: ${declared.problem}`;
  return `The implementer declared these verify:admin runs; the harness has not run them on this commit:\n\n${declared.commands.map((command) => `- \`${command}\``).join("\n")}`;
}

const asListed = ({ head, declared, runs }: VerificationEvidence): string => {
  if (declared.kind === "none")
    return `\`verify:admin\` not run: ${declared.reason}`;
  const listed = runs.map(
    ({ command, summary }) => `- \`${command}\` — ${summary}`,
  );
  return `\`verify:admin\` on ${head}, rerun by the harness:\n\n${listed.join("\n")}`;
};

/** Puts the evidence at the end of the PR's Evidence section, replacing any an earlier commit left. */
export function withVerificationEvidence(
  body: string,
  evidence: VerificationEvidence | null,
): string {
  const without = body.replace(new RegExp(`\\n*${BLOCK.source}`), "");
  if (!evidence) return without;
  const block = `<!-- verify-admin -->\n${asListed(evidence)}\n<!-- /verify-admin -->`;
  const evidenceAt = without.search(/^## Evidence\s*$/m);
  const nextSection =
    evidenceAt === -1
      ? -1
      : without.slice(evidenceAt + 1).search(/^## /m) + evidenceAt + 1;
  if (evidenceAt === -1 || nextSection === evidenceAt)
    return `${without}\n\n${block}`;
  const before = without.slice(0, nextSection).trimEnd();
  return `${before}\n\n${block}\n\n${without.slice(nextSection)}`;
}

/** What a published PR declared, for a repair that starts in a new sandbox. */
export function declarationInPullRequest(body: string): string | null {
  const block = body.match(BLOCK)?.[0];
  if (!block) return null;
  const lines = block.split("\n");
  const optOut = lines.flatMap((line) => line.match(LISTED_OPT_OUT)?.[1] ?? []);
  if (optOut[0] !== undefined) return `none: ${optOut[0]}`;
  const commands = lines.flatMap(
    (line) => line.match(LISTED_COMMAND)?.[1] ?? [],
  );
  return commands.length > 0 ? commands.join("\n") : null;
}
