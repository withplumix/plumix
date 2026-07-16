import * as React from "react";
import { defineTemplate } from "plumix";
import type { SingleData } from "plumix";
import { hasDemoSession } from "@plumix/runtime-cloudflare/demo";

import { Layout } from "../components/Layout";
import { PostSingle } from "../components/PostSingle";

// Static page: title + body, no post metadata.
export const page = defineTemplate<SingleData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  render: ({ data, settings, menus, ctx }) => (
    <Layout
      settings={settings}
      menus={menus}
      showTryEditor={!hasDemoSession(ctx.request)}
    >
      <PostSingle entry={data.entry} showMeta={false} />
    </Layout>
  ),
});
