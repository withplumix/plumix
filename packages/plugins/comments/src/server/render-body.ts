import MarkdownIt from "markdown-it";

/**
 * `html: false` is the whole safety posture: raw HTML is escaped, never parsed,
 * so no separate sanitizer. The default `validateLink` still allows raster
 * `data:` images.
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
