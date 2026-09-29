export const untilTheRunCompletes = async (
  statusOf: () => string,
  pause: () => Promise<void>,
  { attempts }: { attempts: number },
): Promise<boolean> => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (statusOf() === "completed") return true;
    if (attempt < attempts) await pause();
  }
  return false;
};

export const rerunOnceTheRunsFinish = async (
  runIds: readonly string[],
  {
    statusOf,
    rerun,
    pause,
    attempts,
  }: {
    readonly statusOf: (runId: string) => string;
    readonly rerun: (runId: string) => boolean;
    readonly pause: () => Promise<void>;
    readonly attempts: number;
  },
): Promise<boolean> => {
  let started = false;
  for (const runId of runIds) {
    const completed = await untilTheRunCompletes(() => statusOf(runId), pause, {
      attempts,
    });
    if (completed && rerun(runId)) started = true;
  }
  return started;
};
