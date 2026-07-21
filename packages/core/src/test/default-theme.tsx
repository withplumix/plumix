import type { ResolvedEntry } from "../route/render/resolved-entry.js";
import { fallback } from "../route/render/template-builders.js";
import { renderTiptapContent } from "../route/render/tiptap.js";
import { defineTheme } from "../theme.js";

// Test-only theme that mirrors the structure of the dropped inline-HTML
// fallback so resolver tests keep their `body.toContain("<h1>{title}</h1>")`
// assertions. Authored as a single `fallback` template that branches on the
// data shape — real themes narrow via targeted/tier rules.
export const defaultTestTheme = defineTheme({
  templates: [
    fallback(({ data }) => {
      if ("entry" in data) {
        return (
          <article>
            <h1>{data.entry.title}</h1>
            {data.entry.content ? (
              <div
                dangerouslySetInnerHTML={{
                  __html: renderTiptapContent(data.entry.content),
                }}
              />
            ) : null}
          </article>
        );
      }
      if ("author" in data) {
        return (
          <>
            <h1>{data.author.name ?? data.author.slug}</h1>
            <EntryList entries={data.entries} />
          </>
        );
      }
      if ("entries" in data) {
        return (
          <>
            {"term" in data ? <h1>{data.term.name}</h1> : null}
            <EntryList entries={data.entries} />
          </>
        );
      }
      return null;
    }),
  ],
});

function EntryList({ entries }: { entries: readonly ResolvedEntry[] }) {
  if (entries.length === 0) return <p>No entries yet.</p>;
  return (
    <ul>
      {entries.map((e) => (
        <li key={e.id}>
          <a href={`/${e.type}/${e.slug}`}>{e.title}</a>
        </li>
      ))}
    </ul>
  );
}
