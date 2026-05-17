import { mergeAttributes, Node } from "@tiptap/core";

import { OEMBED_PROVIDERS, resolveOEmbed } from "./safelist.js";

export const embedSchema = Node.create({
  name: "media/embed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      url: { default: "" },
      title: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-plumix-block='media/embed']" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-plumix-block": "media/embed" }),
    ];
  },
});

/**
 * `parsePaste` rules so the editor recognises share URLs and converts
 * them into `media/embed` blocks. The rule's `fromHTML` maps the
 * `<a>` href to the block's `url` attr; the Component does the
 * provider-specific URL → iframe-URL mapping at render time.
 */
export const embedParsePasteRules = OEMBED_PROVIDERS.flatMap((provider) =>
  provider.hosts.map((host) => ({
    selector: `a[href*='${host}']`,
    fromHTML(
      element: HTMLElement,
    ): Readonly<Record<string, unknown>> | undefined {
      const href = element.getAttribute("href") ?? "";
      const match = resolveOEmbed(href);
      if (!match) return undefined;
      return { url: href };
    },
  })),
);
