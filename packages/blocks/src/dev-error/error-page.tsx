import type { ReactElement, ReactNode } from "react";

import type {
  DevErrorContext,
  DevErrorFact,
  DevErrorFrame,
  DevErrorHint,
  DevErrorInfo,
  DevErrorQuery,
  DevErrorTimeline,
} from "./contract.js";
import {
  commonBaseDir,
  DEV_ERROR_SOURCE_ENDPOINT,
  relativeFramePath,
} from "./frames.js";

/**
 * The shared dev-error renderer (#1580). Theme-independent: it renders the
 * exception header and — when the stack parsed into frames — a stack view with
 * each frame's original `file:line`, application frames expanded and framework
 * frames collapsed behind a toggle, plus an excerpt panel the client
 * enhancement fills by lazy-fetching source from the dev resolver (#1596). It
 * works even when the theme, layout, or document is what threw. The server page
 * (core) SSRs this into a standalone HTML document with the token sheet
 * inlined; the client overlay (#1603) will mount the same component inside a
 * Shadow DOM root.
 */
export function DevErrorPage({
  error,
  context,
}: {
  readonly error: DevErrorInfo;
  /**
   * The request-scoped context sections (#1598). Present on the server page,
   * absent on the client overlay and the boot-error fallback — the page then
   * shows just the exception, hints, and stack.
   */
  readonly context?: DevErrorContext;
}): ReactElement {
  const frames = error.frames ?? [];
  const appFrames = frames.filter((frame) => !frame.isVendor);
  const vendorFrames = frames.filter((frame) => frame.isVendor);
  // Show paths relative to the project root, derived from the frames so the
  // long absolute prefix doesn't dominate every line. Shared with the client
  // enhancement (which relativizes the excerpt header) via `data-base`.
  const base = commonBaseDir(frames);
  const hints = error.hints ?? [];

  return (
    <div className="plumix-dev-error" data-testid="plumix-dev-error">
      <header className="plumix-dev-error__header">
        <p
          className="plumix-dev-error__name"
          data-testid="plumix-dev-error-name"
        >
          {error.name}
        </p>
        <h1
          className="plumix-dev-error__message"
          data-testid="plumix-dev-error-message"
        >
          {error.message}
        </h1>
      </header>
      {hints.length > 0 ? (
        <section
          className="plumix-dev-error__hints"
          data-testid="plumix-dev-error-hints"
          aria-label="How to fix"
        >
          {hints.map((hint, index) => (
            <HintCard key={hintKey(hint, index)} hint={hint} />
          ))}
        </section>
      ) : null}
      {frames.length > 0 ? (
        <section
          className="plumix-dev-error__frames"
          data-testid="plumix-dev-error-frames"
          data-endpoint={DEV_ERROR_SOURCE_ENDPOINT}
          data-base={base}
        >
          <div className="plumix-dev-error__framelist">
            <ol className="plumix-dev-error__app-frames">
              {appFrames.map((frame, index) => (
                <li key={frameKey(frame, index)}>
                  <FrameButton frame={frame} base={base} />
                </li>
              ))}
            </ol>
            {vendorFrames.length > 0 ? (
              <details
                className="plumix-dev-error__vendor"
                data-testid="plumix-dev-error-vendor"
              >
                <summary className="plumix-dev-error__vendor-summary">
                  {vendorFrames.length} framework{" "}
                  {vendorFrames.length === 1 ? "frame" : "frames"}
                </summary>
                <ol className="plumix-dev-error__vendor-frames">
                  {vendorFrames.map((frame, index) => (
                    <li key={frameKey(frame, index)}>
                      <FrameButton frame={frame} base={base} />
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
          <div
            className="plumix-dev-error__source"
            data-testid="plumix-dev-error-source"
            aria-live="polite"
          >
            <p className="plumix-dev-error__source-empty">
              Select a frame to view its source.
            </p>
          </div>
        </section>
      ) : (
        <section
          className="plumix-dev-error__stack"
          data-testid="plumix-dev-error-stack"
        >
          <pre>
            <code>{error.stack ?? "(no stack available)"}</code>
          </pre>
        </section>
      )}
      {context ? <ContextSections context={context} /> : null}
    </div>
  );
}

/**
 * The request-scoped context, read from the same collectors the debug bar uses
 * but rendered by this page's own sections — the debug bar is never shown here.
 * Each section degrades on its own: the request always has a method and URL, so
 * it always renders; the data-driven ones show an explicit empty note when
 * their collector recorded nothing.
 */
function ContextSections({
  context,
}: {
  readonly context: DevErrorContext;
}): ReactElement {
  return (
    <div className="plumix-dev-error__context">
      <RequestSection context={context} />
      <RouteSection context={context} />
      <DatabaseSection queries={context.queries} />
      <TimelineSection timeline={context.timeline} />
      <ContextSection id="app" title="Application">
        <FactList facts={context.app} />
      </ContextSection>
    </div>
  );
}

function RequestSection({
  context,
}: {
  readonly context: DevErrorContext;
}): ReactElement {
  const { request } = context;
  return (
    <ContextSection id="request" title="Request">
      <FactList
        facts={[
          { label: "Method", value: request.method },
          { label: "URL", value: request.url },
        ]}
      />
      {request.headers.length > 0 ? (
        <>
          <h3 className="plumix-dev-error__subhead">Headers</h3>
          <FactList facts={request.headers} />
        </>
      ) : null}
    </ContextSection>
  );
}

function RouteSection({
  context,
}: {
  readonly context: DevErrorContext;
}): ReactElement {
  const { entity, template } = context.route;
  if (entity === undefined && template === undefined) {
    return (
      <ContextSection id="route" title="Route">
        <EmptyNote>No route resolved.</EmptyNote>
      </ContextSection>
    );
  }
  return (
    <ContextSection id="route" title="Route">
      <FactList
        facts={[
          { label: "Entity", value: entity ?? "—" },
          { label: "Template", value: template ?? "—" },
        ]}
      />
    </ContextSection>
  );
}

function DatabaseSection({
  queries,
}: {
  readonly queries: readonly DevErrorQuery[];
}): ReactElement {
  return (
    <ContextSection
      id="database"
      title={
        queries.length > 0
          ? `Database — ${queries.length} ${queries.length === 1 ? "query" : "queries"}`
          : "Database"
      }
    >
      {queries.length === 0 ? (
        <EmptyNote>No queries recorded.</EmptyNote>
      ) : (
        <>
          <ol className="plumix-dev-error__queries">
            {queries.map((query, index) => (
              <li
                key={`${index}:${query.sql}`}
                className={queryClassName(query)}
              >
                <code className="plumix-dev-error__sql">{query.sql}</code>
                <span className="plumix-dev-error__query-meta">
                  {query.failed ? (
                    <span
                      className="plumix-dev-error__badge"
                      data-testid="plumix-dev-error-query-failed"
                    >
                      failed
                    </span>
                  ) : null}
                  {query.batchFailed ? (
                    <span
                      className="plumix-dev-error__badge plumix-dev-error__badge--muted"
                      data-testid="plumix-dev-error-query-batch-failed"
                    >
                      batch failed
                    </span>
                  ) : null}
                  {query.durationMs !== undefined ? (
                    <span className="plumix-dev-error__query-ms">
                      {query.durationMs}ms
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {queries.some((query) => query.batchFailed) ? (
            <p
              className="plumix-dev-error__query-note"
              data-testid="plumix-dev-error-batch-note"
            >
              One statement in this batch threw and rolled back the whole group.
              A batch is one atomic round-trip, so the driver does not report
              which statement it was.
            </p>
          ) : null}
        </>
      )}
    </ContextSection>
  );
}

function queryClassName(query: DevErrorQuery): string {
  if (query.failed) {
    return "plumix-dev-error__query plumix-dev-error__query--failed";
  }
  if (query.batchFailed) {
    return "plumix-dev-error__query plumix-dev-error__query--batch-failed";
  }
  return "plumix-dev-error__query";
}

function TimelineSection({
  timeline,
}: {
  readonly timeline: DevErrorTimeline;
}): ReactElement {
  if (timeline.rows.length === 0) {
    return (
      <ContextSection id="timeline" title="Timeline">
        <EmptyNote>No spans recorded.</EmptyNote>
      </ContextSection>
    );
  }
  // Guard against a zero window so the bar math never divides by zero.
  const total = timeline.totalMs || 1;
  return (
    <ContextSection id="timeline" title={`Timeline — ${timeline.totalMs}ms`}>
      <ol className="plumix-dev-error__spans">
        {timeline.rows.map((row, index) => (
          <li
            key={`${index}:${row.name}`}
            className={
              row.failed
                ? "plumix-dev-error__span plumix-dev-error__span--failed"
                : "plumix-dev-error__span"
            }
          >
            <span
              className="plumix-dev-error__span-name"
              style={{ paddingLeft: `${row.depth * 0.75}rem` }}
            >
              {row.name}
            </span>
            <span className="plumix-dev-error__span-track">
              <span
                className="plumix-dev-error__span-bar"
                style={{
                  marginLeft: `${(row.offsetMs / total) * 100}%`,
                  width: `${Math.max((row.durationMs / total) * 100, 1)}%`,
                }}
              />
            </span>
            <span className="plumix-dev-error__span-ms">
              {row.durationMs}ms
            </span>
          </li>
        ))}
      </ol>
    </ContextSection>
  );
}

function ContextSection({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section
      className="plumix-dev-error__section"
      data-testid={`plumix-dev-error-${id}`}
      aria-label={title}
    >
      <h2 className="plumix-dev-error__section-title">{title}</h2>
      {children}
    </section>
  );
}

function FactList({
  facts,
}: {
  readonly facts: readonly DevErrorFact[];
}): ReactElement {
  return (
    <dl className="plumix-dev-error__facts">
      {facts.map((fact, index) => (
        <div key={`${index}:${fact.label}`} className="plumix-dev-error__fact">
          <dt className="plumix-dev-error__fact-label">{fact.label}</dt>
          <dd className="plumix-dev-error__fact-value">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyNote({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return <p className="plumix-dev-error__empty">{children}</p>;
}

function HintCard({ hint }: { readonly hint: DevErrorHint }): ReactElement {
  const docs = hint.docs ?? [];
  return (
    <div className="plumix-dev-error__hint" data-testid="plumix-dev-error-hint">
      <p className="plumix-dev-error__hint-title">{hint.title}</p>
      {hint.body !== undefined ? (
        <p className="plumix-dev-error__hint-body">{hint.body}</p>
      ) : null}
      {docs.length > 0 ? (
        <ul className="plumix-dev-error__hint-docs">
          {docs.map((doc) => (
            <li key={doc.href}>
              <a
                className="plumix-dev-error__hint-doc"
                href={doc.href}
                target="_blank"
                rel="noreferrer"
              >
                {doc.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FrameButton({
  frame,
  base,
}: {
  readonly frame: DevErrorFrame;
  readonly base: string;
}): ReactElement {
  return (
    <button
      type="button"
      className="plumix-dev-error__frame"
      data-plumix-frame=""
      data-file={frame.file}
      data-line={String(frame.line)}
      data-testid="plumix-dev-error-frame"
    >
      <span className="plumix-dev-error__frame-fn">
        {frame.functionName ?? "(anonymous)"}
      </span>
      <span className="plumix-dev-error__frame-loc">
        {relativeFramePath(frame.file, base)}:{frame.line}
      </span>
    </button>
  );
}

function frameKey(frame: DevErrorFrame, index: number): string {
  return `${index}:${frame.file}:${frame.line}`;
}

function hintKey(hint: DevErrorHint, index: number): string {
  return `${index}:${hint.title}`;
}
