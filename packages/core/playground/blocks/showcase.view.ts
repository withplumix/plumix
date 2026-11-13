import "./showcase.css";

import type { BlockLoaderArgs, BlockViewProps } from "plumix/blocks";
import type { ReactNode } from "react";
import { createElement as h } from "react";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { and, count, eq } from "plumix/db";

import { Clicker } from "../islands/counter.js";

const entries = sqliteTable("entries", {
  id: integer("id").primaryKey(),
  type: text("type").notNull(),
  authorId: integer("author_id").notNull(),
});

export const loaders = {
  posts: async ({ ctx, attrs }: BlockLoaderArgs): Promise<number> => {
    const [row] = await ctx.db
      .select({ n: count() })
      .from(entries)
      .where(
        and(
          eq(entries.type, "post"),
          eq(entries.authorId, Number(attrs.authorId)),
        ),
      );
    return row?.n ?? 0;
  },
};

export default function ShowcaseView({
  loaders: data,
}: BlockViewProps<object, typeof loaders>): ReactNode {
  return h(
    "div",
    { className: "plumix-showcase", "data-testid": "showcase" },
    h("p", { "data-testid": "showcase-text" }, "Showcase view"),
    h(
      "p",
      { "data-testid": "showcase-posts" },
      typeof data.posts === "number" ? `${String(data.posts)} posts` : "",
    ),
    h(Clicker, { testId: "showcase-clicker" }),
  );
}
