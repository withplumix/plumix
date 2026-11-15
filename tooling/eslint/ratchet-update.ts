import { writeFileSync } from "node:fs";
import * as path from "node:path";

import { RATCHETS, tightenedCeilings } from "./ratchet.ts";

for (const ratchet of RATCHETS) {
  writeFileSync(
    path.join(import.meta.dirname, ratchet.list),
    `${JSON.stringify(tightenedCeilings(ratchet), null, 2)}\n`,
  );
}
