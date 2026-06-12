import MarkdownIt from "markdown-it";

// `html: false` is the whole safety posture: raw HTML in the source is
// escaped to text, never parsed into nodes, so the only elements emitted
// are the ones markdown-it produces from markdown syntax — no separate
// HTML sanitizer needed. markdown-it's default `validateLink` drops
// `javascript:`/`vbscript:`/`file:` and non-raster `data:` link hrefs
// (raster `data:` images are still allowed — tighten in the submission
// slice if embedded images are unwanted).
const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: false,
  breaks: true,
});

const renderToken: NonNullable<typeof md.renderer.rules.link_open> = (
  tokens,
  idx,
  options,
  _env,
  self,
) => self.renderToken(tokens, idx, options);

const defaultLinkOpen = md.renderer.rules.link_open ?? renderToken;

// Every rendered link is user-generated content pointing off-site:
// `nofollow` (no SEO equity), `ugc` (user-generated content hint), and
// `noopener` (sever the `window.opener` handle).
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]?.attrSet("rel", "nofollow ugc noopener");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/** Render a raw markdown comment body to safe, allowlisted HTML. */
export function renderCommentBody(markdown: string): string {
  return md.render(markdown);
}
