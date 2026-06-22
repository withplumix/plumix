import type { ReactElement } from "react";

// One capturing group around the whole token so `split` keeps the tokens in the
// result (odd indices). Strings (a key when a colon trails), the literals, then
// numbers; everything else — punctuation, whitespace — lands on even indices.
const TOKEN =
  /((?:"(?:\\.|[^"\\])*"(?:\s*:)?)|(?:\b(?:true|false|null)\b)|(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?))/g;

function tokenClass(token: string): string {
  if (token.startsWith('"')) {
    return token.trimEnd().endsWith(":")
      ? "text-sky-600 dark:text-sky-400"
      : "text-emerald-600 dark:text-emerald-400";
  }
  if (token === "true" || token === "false" || token === "null") {
    return "text-purple-600 dark:text-purple-400";
  }
  return "text-amber-600 dark:text-amber-400";
}

/**
 * Minimal JSON syntax colouriser. Lazy-loaded (its only consumer code-splits
 * the import) so the highlighter never weighs on the editor's main bundle —
 * the debug source dialog is the sole place it renders.
 */
export default function JsonHighlight({
  json,
  testId,
  className,
}: {
  readonly json: string;
  readonly testId: string;
  readonly className?: string;
}): ReactElement {
  return (
    <pre className={className} data-testid={testId}>
      {json.split(TOKEN).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={tokenClass(part)}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </pre>
  );
}
