import { describe, expect, test } from "vitest";

import {
  auditLogBodyState,
  diffPreviewFields,
  EMPTY_FILTERS,
  filtersFromSearchParams,
  filtersToSearchParams,
  filterToRpcInput,
} from "./filters.js";

describe("auditLogBodyState", () => {
  test("a load in flight shows the loading body", () => {
    expect(
      auditLogBodyState({ isLoading: true, error: null, data: undefined }),
    ).toBe("loading");
  });

  test("a failed load shows the error body", () => {
    expect(
      auditLogBodyState({
        isLoading: false,
        error: new Error("boom"),
        data: undefined,
      }),
    ).toBe("error");
  });

  test("a list no audit row matches shows the empty state", () => {
    expect(
      auditLogBodyState({
        isLoading: false,
        error: null,
        data: { pages: [{ rows: [] }] },
      }),
    ).toBe("empty");
  });

  test("a list with audit rows shows them", () => {
    expect(
      auditLogBodyState({
        isLoading: false,
        error: null,
        data: { pages: [{ rows: [{ id: 1 }] }] },
      }),
    ).toBe("rows");
  });
});

describe("diffPreviewFields", () => {
  test("names the fields a diff changed", () => {
    expect(
      diffPreviewFields({ diff: { title: ["Hello", "Hello world"] } }),
    ).toEqual({ shown: ["title"], overflow: 0 });
  });

  test("names the first three fields and counts the rest", () => {
    expect(
      diffPreviewFields({
        diff: {
          title: ["a", "b"],
          slug: ["a", "b"],
          status: ["draft", "published"],
          excerpt: ["a", "b"],
          content: ["a", "b"],
        },
      }),
    ).toEqual({ shown: ["title", "slug", "status"], overflow: 2 });
  });

  test("a row without a diff has no preview", () => {
    expect(diffPreviewFields({})).toBeNull();
  });

  test("a diff that changed nothing has no preview", () => {
    expect(diffPreviewFields({ diff: {} })).toBeNull();
  });
});

describe("filterToRpcInput", () => {
  test("sends the subject type, event prefix and actor as filter params", () => {
    expect(
      filterToRpcInput({
        preset: "all",
        actorId: "7",
        subjectType: "user",
        eventPrefix: "user:",
      }),
    ).toEqual({ actorId: 7, subjectType: "user", eventPrefix: "user:" });
  });

  test("a date preset sends the range it covers", () => {
    expect(
      filterToRpcInput(
        { ...EMPTY_FILTERS, preset: "last7" },
        new Date("2026-05-10T18:30:00Z"),
      ),
    ).toEqual({ occurredAfter: 1777833000, occurredBefore: 1778437800 });
  });

  test("an actor id that is not a whole number is left out", () => {
    expect(filterToRpcInput({ ...EMPTY_FILTERS, actorId: "7.5" })).toEqual({});
  });

  test("empty filters send no filter params", () => {
    expect(filterToRpcInput(EMPTY_FILTERS)).toEqual({});
  });
});

describe("the filters in the URL", () => {
  test("a shared link's search params hydrate the filters", () => {
    expect(
      filtersFromSearchParams(
        "?eventPrefix=user%3A&actorId=7&subjectType=user&preset=last7",
      ),
    ).toEqual({
      preset: "last7",
      actorId: "7",
      subjectType: "user",
      eventPrefix: "user:",
    });
  });

  test("a changed filter is written to the search params", () => {
    expect(
      filtersToSearchParams({
        ...EMPTY_FILTERS,
        eventPrefix: "user:",
      }).toString(),
    ).toBe("eventPrefix=user%3A");
  });

  test("filters survive the round trip through the URL", () => {
    const filters = {
      preset: "today",
      actorId: "7",
      subjectType: "entry",
      eventPrefix: "entry:",
    } as const;

    expect(
      filtersFromSearchParams(filtersToSearchParams(filters).toString()),
    ).toEqual(filters);
  });

  test("reset leaves no search params behind", () => {
    expect(filtersToSearchParams(EMPTY_FILTERS).toString()).toBe("");
  });

  test("an unknown preset in the URL reads as all time", () => {
    expect(filtersFromSearchParams("?preset=forever").preset).toBe("all");
  });
});
