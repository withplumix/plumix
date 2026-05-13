/**
 * Pagination math shared by the archive and taxonomy resolvers. Pure
 * function so the two resolvers can't drift on boundary conditions —
 * any rule about "what counts as out of range" lives here, in one place,
 * with a single set of tests.
 *
 * `total === 0` is intentionally **not** out of range when `page === 1`
 * — an empty archive renders the 200 empty-state page, mirroring how
 * #224's taxonomy resolver treats a term that exists but has no entries
 * tagged with it.
 */

export interface PaginateInput {
  readonly page: number;
  readonly perPage: number;
  readonly total: number;
}

export interface PaginateResult {
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
