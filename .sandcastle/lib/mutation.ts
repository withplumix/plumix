import type { Executor } from "./gates.js";
import { underAnOrphanReaper } from "./gates.js";

const RUN = "pnpm test:mutation";

/**
 * The lines on this branch no unit test notices (CODING_STANDARDS.md#mutation-testing), for the
 * reviewer to read. The run rewrites files in place, so the tree is put back before anything else.
 */
export const surveyMutants = async (sandbox: Executor): Promise<string> => {
  const { exitCode } = await sandbox.exec(underAnOrphanReaper(RUN));
  await sandbox.exec(underAnOrphanReaper(`${RUN} --restore`));
  if (exitCode !== 0) {
    return "The mutation run failed this pass, so there is no list of surviving lines to read.";
  }
  const { stdout } = await sandbox.exec("cat .cache/mutation/summary.md");
  return stdout;
};
