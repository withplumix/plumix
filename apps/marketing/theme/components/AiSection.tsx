import type { ReactNode } from "react";

import { Chips } from "./Chips";
import { CodePanel } from "./CodePanel";
import { Eyebrow } from "./Eyebrow";
import { SectionHeading } from "./SectionHeading";

// A real `error_list` response from this app's dev server, taken while a
// component threw on /pricing. Trimmed: the stack keeps its first frame and the
// request id is shortened.
const ERROR_LIST = `// POST /_plumix/mcp  tools/call "error_list"
[{
  "source": "server",
  "message": "Cannot read properties of null (reading 'amount')",
  "stack": "TypeError: … at Price (…/Price.tsx:11:14) …",
  "path": "/pricing",
  "requestId": "deb3ab6e-…"
}]`;

const LIVE_CONFIG = `export default plumix({
  // …
  mcp: { enabled: true },
});`;

const DEV_TOOLS = [
  "error_list",
  "telemetry_requests_list",
  "telemetry_request_get",
];

const LIVE_TOOLS = [
  "schema_describe",
  "content_list",
  "content_get",
  "taxonomy_list",
  "term_list",
  "term_get",
];

export function AiSection(): ReactNode {
  return (
    <section
      className="border-line border-t py-24 md:py-32"
      data-testid="ai-section"
    >
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeading
          eyebrow="AI"
          title={
            <>
              Your agent sees <em>what you see.</em>
            </>
          }
        >
          <p>
            Plumix serves MCP. While you build, a coding agent reads the same
            errors and traces you do. On the live site, if you switch it on, an
            agent reads your content with the permissions of the user whose
            token it holds.
          </p>
        </SectionHeading>

        <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-16 lg:grid-cols-2 lg:gap-10">
          <div data-testid="ai-dev">
            <Eyebrow>While you build</Eyebrow>
            <p className="text-muted mt-4 leading-relaxed text-pretty">
              <code className="text-ink font-mono text-sm">plumix dev</code>{" "}
              serves an MCP endpoint on localhost with no setup. Server
              failures, browser errors and request traces each have a tool, and
              browser errors also print in the terminal your agent is already
              reading.
            </p>
            <Chips items={DEV_TOOLS} className="mt-6" />
            <CodePanel
              filename="error_list"
              source={ERROR_LIST}
              className="motion-reveal mt-8"
            />
          </div>

          <div data-testid="ai-live">
            <Eyebrow>On the live site</Eyebrow>
            <p className="text-muted mt-4 leading-relaxed text-pretty">
              Turn it on and agents can describe your content model and read
              entries and terms. Access goes through a personal token, so an
              agent sees exactly what its user may read. Plugins add their own
              tools with{" "}
              <code className="text-ink font-mono text-sm">
                registerMcpTool
              </code>
              .
            </p>
            <Chips items={LIVE_TOOLS} className="mt-6" />
            <CodePanel
              filename="plumix.config.ts"
              source={LIVE_CONFIG}
              className="motion-reveal mt-8"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
