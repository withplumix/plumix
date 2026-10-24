/** Files staged under the admin's `plugins/` folder. */
export interface PluginChunkRef {
  readonly pluginId: string;
  readonly chunkFile: string;
  readonly cssFile?: string;
}

/**
 * Plugin chunks load AFTER the main admin bundle so window.plumix is
 * populated before they execute. Block is replaced (not appended) on
 * rebuild so the HTML stays stable.
 */
const PLUGIN_CHUNKS_MARKER = "<!-- plumix:plugin-chunks -->";
const PLUGIN_CHUNKS_RE =
  /<!-- plumix:plugin-chunks -->[\s\S]*?<!-- \/plumix:plugin-chunks -->/;

export function injectPluginChunkScripts(
  html: string,
  chunks: readonly PluginChunkRef[],
): string {
  const block = buildPluginChunkBlock(chunks);
  if (PLUGIN_CHUNKS_RE.test(html)) {
    return html.replace(PLUGIN_CHUNKS_RE, block);
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${block}\n</body>`);
  }
  return `${html}\n${block}`;
}

function buildPluginChunkBlock(chunks: readonly PluginChunkRef[]): string {
  const tags: string[] = [];
  for (const c of chunks) {
    if (c.cssFile) {
      tags.push(
        `<link rel="stylesheet" data-plumix-plugin="${escapeAttribute(c.pluginId)}" href="${escapeAttribute(pluginAssetUrl(c.cssFile))}">`,
      );
    }
    tags.push(
      `<script type="module" data-plumix-plugin="${escapeAttribute(c.pluginId)}" src="${escapeAttribute(pluginAssetUrl(c.chunkFile))}"></script>`,
    );
  }
  return `${PLUGIN_CHUNKS_MARKER}\n${tags.join("\n")}\n<!-- /plumix:plugin-chunks -->`;
}

/**
 * Relative, so it resolves against the `<base href>` the dispatcher injects
 * into every served shell (`<basePath>/_plumix/admin/`): one built shell loads
 * its plugins under any mount, and from a deep link.
 */
function pluginAssetUrl(file: string): string {
  return `plugins/${file}`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
