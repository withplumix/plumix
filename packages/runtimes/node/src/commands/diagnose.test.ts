import { expect, test } from "vitest";

import { diagnose } from "./diagnose.js";

test("reports where the production server writes its logs", () => {
  expect(diagnose(process.cwd())).toEqual([
    {
      level: "ok",
      message:
        "Logs go to stdout as one JSON object per line; keep them with journald, a container platform's log drain or a process manager",
    },
  ]);
});
