import * as React from "react";
import { defineTemplate } from "plumix";
import type { FrontPageData } from "plumix";

import { Layout } from "../components/Layout";
import { PostList } from "../components/PostList";

// Front page: latest posts. `settings`/`menus` feed the chrome.
export const home = defineTemplate<FrontPageData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  render: ({ data, settings, menus }) => (
    <Layout settings={settings} menus={menus}>
      <PostList entries={data.entries} />
    </Layout>
  ),
});
