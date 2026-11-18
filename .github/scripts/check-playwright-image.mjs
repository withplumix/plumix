// The Playwright image ships the browsers one Playwright release expects, so it fails when the
// image in ci.yml, the Dockerfile Dependabot bumps, and the installed Playwright disagree.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const files = [".github/workflows/ci.yml", ".github/playwright/Dockerfile"];
const refs = new Set(
  files.flatMap((file) =>
    [
      ...readFileSync(file, "utf8").matchAll(
        /mcr\.microsoft\.com\/playwright:\S+?(?=['"\s]|$)/gm,
      ),
    ].map(([ref]) => ref),
  ),
);

const { version } = createRequire(
  `${process.cwd()}/packages/admin/package.json`,
)("@playwright/test/package.json");
const expected = new RegExp(
  `^mcr\\.microsoft\\.com/playwright:v${version.replaceAll(".", "\\.")}-noble@sha256:[0-9a-f]{64}$`,
);

if (refs.size !== 1 || !expected.test([...refs][0])) {
  console.error(
    `The Playwright image must be one digest-pinned v${version}-noble, the installed ` +
      `@playwright/test. Found in ${files.join(" and ")}:\n  ${[...refs].join("\n  ") || "(none)"}`,
  );
  process.exit(1);
}
console.log(
  `Playwright image matches @playwright/test ${version}: ${[...refs][0]}`,
);
