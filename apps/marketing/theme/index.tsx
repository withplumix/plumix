import type { EntryData, ErrorData, FrontPageData } from "plumix/theme";
import {
  defineTemplate,
  defineTheme,
  entry,
  frontPage,
  notFound,
} from "plumix/theme";

import { AiSection } from "./components/AiSection";
import { ClosingSection } from "./components/ClosingSection";
import { ContentSection } from "./components/ContentSection";
import { Hero } from "./components/Hero";
import { HostingSection } from "./components/HostingSection";
import { Layout } from "./components/Layout";
import { PageBody } from "./components/PageBody";
import { PluginsSection } from "./components/PluginsSection";
import { ToolingSection } from "./components/ToolingSection";
import { TOKENS } from "./tokens";

// The landing sections are theme code for now; pages authored in the admin
// render through `entry` so the site can grow without a deploy.
export const marketingTheme = defineTheme({
  templates: [
    frontPage(
      defineTemplate<FrontPageData>({
        render: () => (
          <Layout>
            <Hero />
            <ContentSection />
            <PluginsSection />
            <ToolingSection />
            <AiSection />
            <HostingSection />
            <ClosingSection />
          </Layout>
        ),
      }),
    ),
    entry(
      defineTemplate<EntryData>({
        render: ({ data }) => (
          <Layout>
            <PageBody entry={data.entry} />
          </Layout>
        ),
      }),
    ),
    notFound(
      defineTemplate<ErrorData>({
        render: () => (
          <Layout>
            <section
              className="mx-auto max-w-3xl px-6 py-24"
              data-testid="not-found"
            >
              <h1 className="font-serif text-4xl">Page not found</h1>
              <a href="/" className="text-accent mt-6 inline-block">
                <span aria-hidden="true">←</span> Back home
              </a>
            </section>
          </Layout>
        ),
      }),
    ),
  ],
  tokens: TOKENS,
  css: ["./theme/styles.css"],
  document: {
    titleTemplate: (title) =>
      title ? `${title} · Plumix` : "Plumix: publishing, typed",
    meta: [{ name: "theme-color", content: "#f7f4ee" }],
  },
});
