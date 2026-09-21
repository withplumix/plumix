import type { ReactNode } from "react";

interface CodePanelProps {
  readonly filename: string;
  readonly source: string;
  readonly className?: string;
}

// Enough of TypeScript to colour the snippets this site shows: comments,
// strings, calls and the keywords they use. The snippets are a known, small
// set in `snippets/`, so a full highlighter (and its bundle) buys nothing.
const TOKEN =
  /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*")|([A-Za-z_$][\w$]*)(?=\()|\b(import|from|export|default|const|type|typeof|declare|module|interface)\b/g;

function tokenColor([, comment, string, call]: RegExpExecArray): string {
  if (comment) return "var(--code-comment)";
  if (string) return "var(--code-string)";
  if (call) return "var(--code-call)";
  return "var(--code-keyword)";
}

function highlight(source: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    const [text] = match;
    if (match.index > last) out.push(source.slice(last, match.index));
    out.push(
      <span key={match.index} style={{ color: tokenColor(match) }}>
        {text}
      </span>,
    );
    last = match.index + text.length;
  }
  out.push(source.slice(last));
  return out;
}

export function CodePanel({
  filename,
  source,
  className = "",
}: CodePanelProps): ReactNode {
  return (
    <figure
      className={`code-panel overflow-hidden rounded-xl bg-[var(--code-bg)] shadow-[0_30px_60px_-30px_rgba(26,23,20,0.45)] ${className}`}
      data-testid="code-panel"
    >
      <figcaption
        translate="no"
        className="flex items-center gap-2 border-b border-white/10 px-4 py-3 font-mono text-xs text-[var(--code-comment)]"
      >
        <span aria-hidden="true" className="flex gap-2">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </span>
        <span className="ml-2">{filename}</span>
      </figcaption>
      <pre
        translate="no"
        className="overflow-x-auto p-5 font-mono text-[12.5px] leading-[1.7] text-[var(--code-fg)]"
      >
        <code>{highlight(source.trimEnd())}</code>
      </pre>
    </figure>
  );
}
