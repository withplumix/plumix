import type { ReactElement } from "react";

import type { DevErrorFrame, DevErrorInfo } from "./contract.js";
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
}: {
  readonly error: DevErrorInfo;
}): ReactElement {
  const frames = error.frames ?? [];
  const appFrames = frames.filter((frame) => !frame.isVendor);
  const vendorFrames = frames.filter((frame) => frame.isVendor);
  // Show paths relative to the project root, derived from the frames so the
  // long absolute prefix doesn't dominate every line. Shared with the client
  // enhancement (which relativizes the excerpt header) via `data-base`.
  const base = commonBaseDir(frames);

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
