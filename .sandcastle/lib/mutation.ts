import type { Executor } from "./gates.js";
import { underAnOrphanReaper } from "./gates.js";

const RUN = "pnpm test:mutation";
const FAILURE_LINES_KEPT = 40;

/**
 * The lines on this branch no unit test notices (CODING_STANDARDS.md#mutation-testing), for the
 * reviewer to read. The run rewrites files in place, so the tree is put back before anything else.
 */
export const surveyMutants = async (sandbox: Executor): Promise<string> => {
  const run = await sandbox.exec(underAnOrphanReaper(RUN));
  await sandbox.exec(underAnOrphanReaper(`${RUN} --restore`));
  if (run.exitCode !== 0) {
    const tail = `${run.stdout}${run.stderr}`
      .trimEnd()
      .split("\n")
      .slice(-FAILURE_LINES_KEPT)
      .join("\n");
    return `The mutation run failed this pass, so there is no list of surviving lines to read. It ended:\n\n\`\`\`\n${tail}\n\`\`\``;
  }
  const { stdout } = await sandbox.exec("cat .cache/mutation/summary.md");
  return stdout;
};
