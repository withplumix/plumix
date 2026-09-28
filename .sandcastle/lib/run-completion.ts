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
