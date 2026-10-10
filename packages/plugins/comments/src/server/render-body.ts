import MarkdownIt from "markdown-it";

/**
 * `html: false` escapes raw HTML, so no sanitizer; the default `validateLink`
 * is the other half, dropping `javascript:`/`vbscript:`/`file:` hrefs. Don't
 * override it.
 */
const md = new MarkdownIt({
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
