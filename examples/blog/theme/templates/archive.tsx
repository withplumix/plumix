import * as React from "react";
import { defineTemplate } from "plumix";
import type { ArchiveData } from "plumix";

import { Layout } from "../components/Layout";
import { PostList } from "../components/PostList";
import { paginationInfo } from "../components/Pagination";

// Post-type archive (e.g. /posts), paginated.
export const archive = defineTemplate<ArchiveData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  render: ({ data, settings, menus, ctx }) => (
    <Layout settings={settings} menus={menus}>
      <PostList
        entries={data.entries}
        heading="Posts"
        pagination={paginationInfo(ctx.request.url, data.pagination)}
      />
    </Layout>
  ),
});
