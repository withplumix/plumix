import type { TitleTemplate } from "../../theme.js";

interface ComposeTitleArgs {
  readonly templateTitle: string | undefined;
  readonly templateAbsolute: boolean;
  readonly themeTitleTemplate: TitleTemplate | undefined;
  /** Resolver-computed default — back-compat fallback when nothing else fires. */
  readonly resolverTitle: string;
}

export function composeTitle({
  templateTitle,
  templateAbsolute,
  themeTitleTemplate,
  resolverTitle,
}: ComposeTitleArgs): string {
  if (templateAbsolute) {
    return templateTitle ?? resolverTitle;
  }
  if (themeTitleTemplate !== undefined) {
    if (typeof themeTitleTemplate === "function") {
      return themeTitleTemplate(templateTitle);
    }
    // Avoid unhead's `"%s · Site"` → `" · Site"` orphan-separator footgun:
    // string form falls back to the resolver title when there's nothing
    // to substitute. Themes that need full control reach for the function.
    if (templateTitle === undefined) {
      return resolverTitle;
    }
    return themeTitleTemplate.replaceAll("%s", templateTitle);
  }
  return templateTitle ?? resolverTitle;
}
