import { parseArgs } from "node:util";

import { namingFindings } from "./pr-names/check.ts";

const { values } = parseArgs({
  options: {
    branch: { type: "string", default: "" },
    title: { type: "string", default: "" },
  },
});

const findings = namingFindings({ branch: values.branch, title: values.title });

for (const finding of findings) console.error(finding);
process.exitCode = findings.length === 0 ? 0 : 1;
