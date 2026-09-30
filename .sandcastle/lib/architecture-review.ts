import { z } from "zod";

export const upstreamSection = (markdown: string, heading: string): string => {
  const lines = markdown.split("\n");
  const start = lines.indexOf(heading);
  if (start === -1)
    throw new Error(`upstream skill has no "${heading}" section`);
  const depth = heading.indexOf(" ");
  const end = lines.findIndex(
    (line, index) =>
      index > start && /^#+ /.test(line) && line.indexOf(" ") <= depth,
  );
  return lines
    .slice(start, end === -1 ? undefined : end)
    .join("\n")
    .trim();
};

export type ReviewResult =
  | {
      readonly status: "proposed";
      readonly title: string;
      readonly report: string;
    }
  | { readonly status: "skipped"; readonly reason: string };

const lastBlock = (stdout: string, tag: string): string | null => {
  const close = stdout.lastIndexOf(`</${tag}>`);
  const open = stdout.lastIndexOf(`<${tag}>`, close);
  if (close === -1 || open === -1) return null;
  return stdout.slice(open + tag.length + 2, close).trim() || null;
};

export const readReviewResult = (stdout: string): ReviewResult | null => {
  const title = lastBlock(stdout, "title");
  const report = lastBlock(stdout, "report");
  if (title && report) return { status: "proposed", title, report };
  const reason = lastBlock(stdout, "skipped");
  return reason ? { status: "skipped", reason } : null;
};

const listedMarketplaces = z.array(
  z.object({ name: z.string(), installLocation: z.string() }),
);

export const marketplaceLocation = (listJson: string, name: string): string => {
  const found = listedMarketplaces
    .parse(JSON.parse(listJson))
    .find((marketplace) => marketplace.name === name);
  if (!found)
    throw new Error(
      `no "${name}" marketplace — run .sandcastle/install-mattpocock-skills.sh`,
    );
  return found.installLocation;
};

const WHAT_TO_DO_WITH_IT = `---

_Filed by the weekly [architecture review](https://github.com/withplumix/plumix/blob/main/.github/workflows/architecture-review.yml)._

- **Worth doing:** \`/grill-with-docs\` this issue, then \`/to-spec\`, \`/to-tickets\` and \`/ship\` the spec.
- **Too big for one session:** \`/wayfinder\`.
- **Not worth it:** close it with the reason. Later runs treat that reason as binding.`;

export const issueBody = (report: string): string =>
  `${report}\n\n${WHAT_TO_DO_WITH_IT}\n`;
