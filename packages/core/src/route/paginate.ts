// An empty archive's page 1 is in range and renders the 200 empty state; date
// archives instead 404 when empty.

interface PaginateInput {
  readonly page: number;
  readonly perPage: number;
  readonly total: number;
}

interface PaginateResult {
  readonly offset: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly outOfRange: boolean;
}

export function paginate(input: PaginateInput): PaginateResult {
  const { page, perPage, total } = input;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const validPage = Number.isInteger(page) && page >= 1;
  const inRange = validPage && (total === 0 ? page === 1 : page <= totalPages);
  return {
    offset: Math.max(0, (page - 1) * perPage),
    limit: perPage,
    totalPages,
    outOfRange: !inRange,
  };
}
