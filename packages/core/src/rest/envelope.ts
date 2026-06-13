export function listEnvelope<T>(
  data: T[],
  options: {
    readonly url: URL;
    readonly page: number;
    readonly perPage: number;
    readonly hasNext: boolean;
  },
) {
  const { url, page, perPage, hasNext } = options;
  return {
    data,
    meta: { page, per_page: perPage },
    links: {
      self: pageUrl(url, page),
      ...(hasNext ? { next: pageUrl(url, page + 1) } : {}),
      ...(page > 1 ? { prev: pageUrl(url, page - 1) } : {}),
    },
  };
}

// Relative path + query so links don't pin the response to an internal origin;
// clients resolve them against the request base.
function pageUrl(url: URL, page: number): string {
  const next = new URL(url);
  next.searchParams.set("page", String(page));
  return `${next.pathname}${next.search}`;
}
