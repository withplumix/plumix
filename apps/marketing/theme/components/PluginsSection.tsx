import type { ReactNode } from "react";

import { SectionHeading } from "./SectionHeading";

// Descriptions follow each plugin's package.json.
const PLUGINS = [
  ["blog", "Posts, categories and tags"],
  ["pages", "Hierarchical static pages"],
  ["media", "Uploads, a library and CDN delivery"],
  ["seo", "Head meta, Open Graph, structured data, robots.txt, sitemap"],
  ["og", "Social cards rendered and served at the edge"],
  ["menu", "Navigation menus from entries, terms or URLs"],
  ["search", "A full-text index that updates as entries change"],
  ["forms", "Forms declared in config, placed as a block"],
  ["comments", "Threaded, moderated discussion on entries"],
  ["feeds", "RSS and Atom for the site and every archive"],
  ["audit-log", "An activity feed of entry, user and settings events"],
] as const;

const PLUGIN_API = [
  "entry types",
  "fields",
  "hooks",
  "RPC",
  "REST resources",
  "scheduled tasks",
  "admin pages",
  "blocks",
  "MCP tools",
];

export function PluginsSection(): ReactNode {
  return (
    <section
      className="border-line border-t py-24 md:py-32"
      data-testid="plugins-section"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-12 px-6 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-5">
          <SectionHeading
            eyebrow="Plugins"
            title={
              <>
                The first-party plugins use <em>the API you get.</em>
              </>
            }
          >
            <p>
              Blog, media and SEO aren't built into core. They are plugins,
              written against the same <code>definePlugin</code> API you write
              yours with.
            </p>
          </SectionHeading>
          <p className="text-muted mt-8 text-sm leading-relaxed text-pretty">
            A plugin can register{" "}
            {PLUGIN_API.map((item, index) => (
              <span key={item}>
                <span className="text-ink font-mono text-xs">{item}</span>
                {index < PLUGIN_API.length - 1 ? ", " : "."}
              </span>
            ))}
          </p>
        </div>
        <ul
          className="motion-reveal border-line border-t lg:col-span-7"
          data-testid="plugin-index"
        >
          {PLUGINS.map(([name, description]) => (
            <li
              key={name}
              className="border-line grid grid-cols-[minmax(0,11rem)_1fr] gap-4 border-b py-3.5 text-sm"
            >
              <span className="font-mono text-xs leading-5" translate="no">
                @plumix/plugin-{name}
              </span>
              <span className="text-muted">{description}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
