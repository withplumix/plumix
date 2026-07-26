// The client enhancement for the dev error page's stack view (#1596). It is
// deliberately self-contained — no imports, no references outside its own
// scope — because core inlines it into the standalone page via
// `enhanceDevError.toString()`, where module bindings don't exist. The zero-JS
// baseline already lists every frame with its original `file:line` and hides
// vendor frames behind a `<details>`; this layer adds selecting a frame to
// lazy-fetch and highlight its source excerpt from the dev resolver, reading
// the endpoint straight off the DOM (`data-endpoint`).

interface ExcerptResponse {
  readonly file: string;
  readonly line: number;
  readonly lines: readonly {
    readonly number: number;
    readonly content: string;
    readonly highlighted: boolean;
  }[];
}

export function enhanceDevError(doc: Document, fetchImpl?: typeof fetch): void {
  const root = doc.querySelector('[data-testid="plumix-dev-error-frames"]');
  if (!root) return;
  const endpoint = root.getAttribute("data-endpoint");
  const found = root.querySelector('[data-testid="plumix-dev-error-source"]');
  if (!endpoint || !found) return;
  // Bound to a fresh const so the closures below keep the non-null type.
  const panel = found;

  const frames = Array.from(
    root.querySelectorAll<HTMLElement>("[data-plumix-frame]"),
  );
  const [firstFrame] = frames;
  if (!firstFrame) return;

  // Shared with the server render (`data-base` on the frames section): the
  // project-root prefix, so the excerpt header reads root-relative too.
  const base = root.getAttribute("data-base") ?? "";

  const view = doc.defaultView;
  const resolved = fetchImpl ?? (view ? view.fetch.bind(view) : undefined);
  if (!resolved) return;
  const doFetch = resolved;

  // Guards against an out-of-order response overwriting a newer selection.
  let requestId = 0;

  function message(text: string): void {
    const paragraph = doc.createElement("p");
    paragraph.className = "plumix-dev-error__source-empty";
    paragraph.textContent = text;
    panel.replaceChildren(paragraph);
  }

  async function select(frame: HTMLElement): Promise<void> {
    const file = frame.getAttribute("data-file");
    const line = frame.getAttribute("data-line");
    if (!file || !line) return;

    for (const other of frames) other.removeAttribute("aria-current");
    frame.setAttribute("aria-current", "true");

    const id = (requestId += 1);
    message("Loading source…");
    const giveUp = (): void => {
      if (id === requestId) {
        message(`Could not load source for ${file}:${line}.`);
      }
    };

    let excerpt: ExcerptResponse;
    try {
      const url = `${endpoint}?file=${encodeURIComponent(
        file,
      )}&line=${encodeURIComponent(line)}`;
      const response = await doFetch(url);
      if (!response.ok) {
        giveUp();
        return;
      }
      excerpt = (await response.json()) as ExcerptResponse;
    } catch {
      giveUp();
      return;
    }
    if (id !== requestId) return;

    const shownFile =
      base && excerpt.file.startsWith(base)
        ? excerpt.file.slice(base.length)
        : excerpt.file;
    const head = doc.createElement("div");
    head.className = "plumix-dev-error__excerpt-head";
    head.textContent = `${shownFile}:${String(excerpt.line)}`;

    const list = doc.createElement("div");
    list.className = "plumix-dev-error__excerpt";
    for (const row of excerpt.lines) {
      const lineEl = doc.createElement("div");
      lineEl.className =
        "plumix-dev-error__line" +
        (row.highlighted ? " plumix-dev-error__line--highlighted" : "");
      const number = doc.createElement("span");
      number.className = "plumix-dev-error__ln";
      number.textContent = String(row.number);
      const code = doc.createElement("span");
      code.className = "plumix-dev-error__code";
      code.textContent = row.content;
      lineEl.append(number, code);
      list.append(lineEl);
    }
    panel.replaceChildren(head, list);
  }

  for (const frame of frames) {
    frame.addEventListener("click", () => void select(frame));
  }
  void select(firstFrame);
}
