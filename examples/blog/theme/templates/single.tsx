import * as React from "react";
import { defineTemplate } from "plumix";
import type { SingleData } from "plumix";
// Importing the thread type also pulls the plugin's `comments` template-dep
// augmentation, so `comments: ["current"]` is typed on the render args.
import type { ResolvedThread } from "@plumix/plugin-comments/server";

import { Layout } from "../components/Layout";
import { PostSingle } from "../components/PostSingle";
import { Comments } from "../components/Comments";

export const single = defineTemplate<SingleData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  comments: ["current"],
  render: ({ data, settings, menus, comments }) => {
    const thread: ResolvedThread | null = comments?.current ?? null;
    return (
      <Layout settings={settings} menus={menus}>
        <PostSingle entry={data.entry} />
        <Comments thread={thread} />
      </Layout>
    );
  },
});
