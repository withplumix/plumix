import type { ReactElement } from "react";

// One capturing group so `split` keeps tokens at odd indices.
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

/** Import lazily so it stays out of the editor's main bundle. */
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
