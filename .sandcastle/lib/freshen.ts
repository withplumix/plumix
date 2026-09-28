import type { Executor } from "./gates.js";

export const rebaseOntoLatestMain = async (
  sandbox: Executor,
  fetchMain: () => void,
): Promise<"rebased" | "kept"> => {
  fetchMain();
  const { exitCode } = await sandbox.exec("git rebase origin/main");
  if (exitCode === 0) return "rebased";
  await sandbox.exec("git rebase --abort");
  return "kept";
};
