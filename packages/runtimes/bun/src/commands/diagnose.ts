import type { RuntimeDiagnose } from "plumix/cli";

export const diagnose: RuntimeDiagnose = () => [
  {
    level: "ok",
    message:
      "Logs go to stdout as one JSON object per line; keep them with journald, a container platform's log drain or a process manager",
  },
];
