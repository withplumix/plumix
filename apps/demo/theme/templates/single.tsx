import type { EntryData } from "plumix";
import { defineTemplate } from "plumix";

// Likewise pulls the blog plugin's `relatedPosts` dep augmentation.
import type { RelatedPosts as RelatedPostsData } from "@plumix/plugin-blog";
// Importing the thread type also pulls the plugin's `comments` template-dep
// augmentation, so `comments: ["current"]` is typed on the render args.
import type { ResolvedThread } from "@plumix/plugin-comments/server";
import { hasDemoSession } from "@plumix/runtime-cloudflare/demo";

import { Comments } from "../components/Comments";
import { Layout } from "../components/Layout";
import { PostSingle } from "../components/PostSingle";
import { RelatedPosts } from "../components/RelatedPosts";

export const single = defineTemplate<EntryData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  comments: ["current"],
  relatedPosts: ["related"],
  render: ({ data, settings, menus, comments, relatedPosts, ctx }) => {
    const thread: ResolvedThread | null = comments?.current ?? null;
    const related: RelatedPostsData = relatedPosts?.related ?? [];
    return (
      <Layout
        settings={settings}
        menus={menus}
        showTryEditor={!hasDemoSession(ctx.request)}
      >
        <PostSingle entry={data.entry} />
        <Comments thread={thread} />
        <RelatedPosts entries={related} />
      </Layout>
    );
  },
});
