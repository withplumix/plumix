import * as React from "react";
import { defineTemplate } from "plumix";
import type { TemplateData } from "plumix";

import { Layout } from "../components/Layout";
import { PostList } from "../components/PostList";

// Registered as the theme's `index` slot — the ultimate hierarchy
// fallback. Renders the chrome and lists entries when the node carries
// them, otherwise just the shell.
export const fallback = defineTemplate<TemplateData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  render: ({ data, settings, menus }) => (
    <Layout settings={settings} menus={menus}>
      {"entries" in data ? <PostList entries={data.entries} /> : null}
    </Layout>
  ),
});
