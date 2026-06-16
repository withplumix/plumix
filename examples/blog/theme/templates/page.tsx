import * as React from "react";
import { defineTemplate } from "plumix";
import type { SingleData } from "plumix";

import { Layout } from "../components/Layout";
import { PostSingle } from "../components/PostSingle";

// Static page: title + body, no post metadata.
export const page = defineTemplate<SingleData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  render: ({ data, settings, menus }) => (
    <Layout settings={settings} menus={menus}>
      <PostSingle entry={data.entry} showMeta={false} />
    </Layout>
  ),
});
