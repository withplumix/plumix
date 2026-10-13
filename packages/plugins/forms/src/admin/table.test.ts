import type { MessageDescriptor } from "plumix/i18n";
import { setupI18n } from "@lingui/core";
import { describe, expect, test } from "vitest";

import type { SubmissionDTO } from "../types.js";
import {
  boundLabel,
  countFor,
  detailViewState,
  formFilterOptions,
  inboxViewState,
  submissionsPageInput,
} from "./table.js";

/** The source message, as the inbox renders it with no catalog loaded. */
function rendered(descriptor: MessageDescriptor | null): string | null {
  if (descriptor === null) return null;
  const i18n = setupI18n({ locale: "en", messages: { en: {} } });
  return i18n._(descriptor);
}

const ROW: SubmissionDTO = {
  id: 7,
  form: "contact",
  status: "new",
  answers: { name: "Ada" },
  labels: { name: { label: "Your name" } },
  bound: null,
  ipHash: null,
  userAgent: null,
  handlerError: null,
  note: null,
  createdAt: "2026-06-01T10:00:00.000Z",
};

describe("formFilterOptions", () => {
  test("offers every declared form under its own title", () => {
    expect(
      formFilterOptions(
        [{ slug: "contact", title: "Contact us" }],
        [],
        undefined,
      ),
    ).toEqual([{ slug: "contact", title: "Contact us" }]);
  });

  test("offers a slug that only has a backlog, under the slug itself", () => {
    expect(
      formFilterOptions(
        [{ slug: "contact", title: "Contact us" }],
        ["contact", "retired"],
        undefined,
      ),
    ).toEqual([
      { slug: "contact", title: "Contact us" },
      { slug: "retired", title: "retired" },
    ]);
  });

  test("keeps the slug being filtered by, even with nothing counted under it", () => {
    expect(
      formFilterOptions([], [], "retired").map((form) => form.slug),
    ).toEqual(["retired"]);
  });
});

describe("countFor", () => {
  test("reads the count kept under a key", () => {
    expect(countFor({ contact: 5 }, "contact")).toBe(5);
  });

  test("counts nothing under a key with no count", () => {
    expect(countFor({ contact: 5 }, "survey")).toBe(0);
  });

  test("counts nothing for a form called constructor", () => {
    expect(countFor({ contact: 5 }, "constructor")).toBe(0);
  });

  test("counts nothing before the counts arrive", () => {
    expect(countFor(undefined, "contact")).toBe(0);
  });
});

describe("boundLabel", () => {
  test.each([
    ["entry", "Entry #42"],
    ["term", "Term #42"],
    ["author", "Author #42"],
  ] as const)(
    "names a submission bound to an %s by kind and id",
    (type, label) => {
      expect(rendered(boundLabel({ type, id: 42 }))).toBe(label);
    },
  );

  test("names nothing for a submission bound to nothing", () => {
    expect(boundLabel(null)).toBeNull();
  });
});

describe("submissionsPageInput", () => {
  test("asks for the first page with the filter alone", () => {
    expect(submissionsPageInput({ status: "spam" }, undefined)).toEqual({
      status: "spam",
    });
  });

  test("asks for the next page with the cursor the last one returned", () => {
    expect(submissionsPageInput({ status: "spam" }, "7")).toEqual({
      status: "spam",
      cursor: "7",
    });
  });
});

describe("inboxViewState", () => {
  test("shows the loading state until the first page arrives", () => {
    expect(inboxViewState({ isLoading: true, error: null }, [])).toBe(
      "loading",
    );
  });

  test("shows the error when the list failed to load", () => {
    expect(
      inboxViewState({ isLoading: false, error: new Error("offline") }, []),
    ).toBe("error");
  });

  test("says nothing has come in when the list is empty", () => {
    expect(inboxViewState({ isLoading: false, error: null }, [])).toBe("empty");
  });

  test("shows the rows of a list with submissions", () => {
    expect(inboxViewState({ isLoading: false, error: null }, [ROW])).toBe(
      "rows",
    );
  });
});

describe("detailViewState", () => {
  test("shows the loading state until the submission arrives", () => {
    expect(detailViewState({ isLoading: true, data: undefined })).toEqual({
      kind: "loading",
    });
  });

  test("says the submission is gone when the read found none", () => {
    expect(detailViewState({ isLoading: false, data: undefined })).toEqual({
      kind: "gone",
    });
  });

  test("shows the submission the read found", () => {
    expect(detailViewState({ isLoading: false, data: ROW })).toEqual({
      kind: "ready",
      row: ROW,
    });
  });
});
