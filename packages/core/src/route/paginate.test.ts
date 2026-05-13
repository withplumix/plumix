import { describe, expect, test } from "vitest";

import { paginate } from "./paginate.js";

describe("paginate", () => {
  test("page 1 of a non-empty result set returns offset 0", () => {
    expect(paginate({ page: 1, perPage: 10, total: 25 })).toEqual({
      offset: 0,
      limit: 10,
      totalPages: 3,
      outOfRange: false,
    });
  });

  test("page 2 with perPage 10 returns offset 10", () => {
    expect(paginate({ page: 2, perPage: 10, total: 25 })).toEqual({
      offset: 10,
      limit: 10,
      totalPages: 3,
      outOfRange: false,
    });
  });

  test("page > totalPages on a non-empty result is out of range", () => {
    expect(paginate({ page: 4, perPage: 10, total: 25 })).toMatchObject({
      totalPages: 3,
      outOfRange: true,
    });
  });

  test("page === totalPages is still in range", () => {
    expect(paginate({ page: 3, perPage: 10, total: 25 })).toMatchObject({
      totalPages: 3,
      outOfRange: false,
    });
  });

  test("page 1 of an empty result set is in range (renders the empty archive)", () => {
    expect(paginate({ page: 1, perPage: 10, total: 0 })).toEqual({
      offset: 0,
      limit: 10,
      totalPages: 1,
      outOfRange: false,
    });
  });

  test("page > 1 on an empty result set is out of range", () => {
    expect(paginate({ page: 2, perPage: 10, total: 0 })).toMatchObject({
      outOfRange: true,
    });
  });

  test("page < 1 is out of range — caller passed an invalid URL param", () => {
    expect(paginate({ page: 0, perPage: 10, total: 25 })).toMatchObject({
      outOfRange: true,
    });
    expect(paginate({ page: -1, perPage: 10, total: 25 })).toMatchObject({
      outOfRange: true,
    });
  });

  test("non-integer page is out of range", () => {
    expect(paginate({ page: 1.5, perPage: 10, total: 25 })).toMatchObject({
      outOfRange: true,
    });
    expect(paginate({ page: Number.NaN, perPage: 10, total: 25 })).toMatchObject(
      {
        outOfRange: true,
      },
    );
  });
});
