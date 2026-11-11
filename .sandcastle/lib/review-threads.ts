import type { ReviewThread } from "./verdict.js";

export interface GitHubPage<T> {
  readonly nodes: readonly T[];
  readonly pageInfo: {
    readonly hasNextPage: boolean;
    readonly endCursor: string | null;
  };
}

export interface ReviewComment {
  readonly author: {
    readonly login: string;
    readonly __typename: string;
  } | null;
  readonly body: string;
  readonly url: string;
}

export interface GitHubThread {
  readonly id: string;
  readonly isResolved: boolean;
  readonly path: string;
  readonly line: number | null;
  readonly comments: GitHubPage<ReviewComment>;
}

function pages<T>(
  first: GitHubPage<T>,
  next: (cursor: string) => GitHubPage<T>,
): readonly T[] {
  const nodes = [...first.nodes];
  let page = first;
  while (page.pageInfo.hasNextPage) {
    const cursor = page.pageInfo.endCursor;
    if (!cursor) throw new Error("GitHub page has no continuation cursor");
    page = next(cursor);
    nodes.push(...page.nodes);
  }
  return nodes;
}

export function readReviewThreads(
  first: GitHubPage<GitHubThread>,
  nextThreads: (cursor: string) => GitHubPage<GitHubThread>,
  nextReplies: (threadId: string, cursor: string) => GitHubPage<ReviewComment>,
): readonly ReviewThread[] {
  return pages(first, nextThreads).flatMap((thread) => {
    if (thread.isResolved) return [];
    const comments = pages(thread.comments, (cursor) =>
      nextReplies(thread.id, cursor),
    );
    const [first] = comments;
    if (!first || first.author?.login === "github-advanced-security") return [];
    return [
      {
        id: thread.id,
        author: first.author?.login ?? "ghost",
        byABot: first.author?.__typename === "Bot",
        location: `${thread.path}${thread.line ? `:${thread.line}` : ""}`,
        url: first.url,
        body: comments
          .map(
            (comment) => `${comment.author?.login ?? "ghost"}: ${comment.body}`,
          )
          .join("\n\n"),
      },
    ];
  });
}
