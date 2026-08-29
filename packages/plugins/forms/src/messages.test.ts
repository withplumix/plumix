import { readFileSync } from "node:fs";
import { join } from "node:path";
import { setupI18n } from "@lingui/core";
import { describe, expect, test } from "vitest";

import {
  emailMessage,
  outOfRangeMessage,
  removeRowLabel,
  requiredMessage,
  rowLegend,
  stepPositionMessage,
  tooFewRowsMessage,
  tooLongMessage,
  tooManyRowsMessage,
  urlMessage,
} from "./messages.js";

// A visitor reads these in the locale they were authored in — the public
// render path has no catalog to resolve against — so what the ICU source
// messages render to is the contract, not an implementation detail.
describe("interpolated messages", () => {
  test("names the field a rejection is about", () => {
    expect(requiredMessage("Your name")).toBe("Your name is required.");
    expect(emailMessage("Email")).toBe(
      "Email must look like name@example.com.",
    );
    expect(urlMessage("Site")).toBe(
      "Site must be a web address starting http:// or https://.",
    );
    expect(tooLongMessage("Bio", 200)).toBe(
      "Bio must be 200 characters or fewer.",
    );
  });

  test("picks the bound clause the field actually declares", () => {
    expect(outOfRangeMessage("Age", 1, 9)).toBe("Age must be between 1 and 9.");
    expect(outOfRangeMessage("Age", 5, undefined)).toBe(
      "Age must be 5 or more.",
    );
    expect(outOfRangeMessage("Age", undefined, 9)).toBe(
      "Age must be 9 or less.",
    );
  });

  test("counts rows through a plural rather than a fixed suffix", () => {
    expect(tooFewRowsMessage("Attendees", 1)).toBe(
      "Attendees needs at least 1 entry.",
    );
    expect(tooFewRowsMessage("Attendees", 2)).toBe(
      "Attendees needs at least 2 entries.",
    );
    expect(tooManyRowsMessage("Attendees", 1)).toBe(
      "Attendees takes at most 1 entry.",
    );
    expect(tooManyRowsMessage("Attendees", 2)).toBe(
      "Attendees takes at most 2 entries.",
    );
  });

  test("numbers a step and a repeater row as the visitor sees them", () => {
    expect(stepPositionMessage(3, 3)).toBe("Step 3 of 3");
    expect(rowLegend("Attendee", 0)).toBe("Attendee 1");
    expect(removeRowLabel("Attendee", 1)).toBe("Remove Attendee 2");
  });
});

// `lingui compile` fails on a malformed ICU message but not on a plural
// that is missing one of the locale's categories — the count would then
// silently fall through to `other`. These read the committed `.po`
// rather than the compiled catalogs, which are build output.
const catalog = (locale: string): Map<string, string> => {
  // vitest runs with the package root as cwd.
  const po = readFileSync(
    join(process.cwd(), "locales", `${locale}.po`),
    "utf8",
  );
  const entries = new Map<string, string>();
  for (const [, id, message] of po.matchAll(
    /^msgid "(.+)"\nmsgstr "(.*)"$/gm,
  )) {
    if (id !== undefined && message !== undefined) entries.set(id, message);
  }
  return entries;
};

const render = (
  locale: string,
  id: string,
  values: Record<string, unknown>,
): string => {
  const message = catalog(locale).get(id);
  if (message === undefined) throw new Error(`${locale} has no ${id}`);
  const i18n = setupI18n();
  i18n.load(locale, {});
  i18n.activate(locale);
  return i18n._(id, values, { message });
};

const TOO_FEW = "plugin.forms.error.tooFewRows";
const TOO_MANY = "plugin.forms.error.tooManyRows";

describe("row-count plurals across the launch set", () => {
  test("Ukrainian inflects across one, few and many", () => {
    const forms = [1, 2, 5].map((count) =>
      render("uk", TOO_FEW, { label: "Гості", count }),
    );
    expect(forms).toEqual([
      "Гості: потрібно щонайменше 1 запис.",
      "Гості: потрібно щонайменше 2 записи.",
      "Гості: потрібно щонайменше 5 записів.",
    ]);
  });

  test("Arabic inflects across one, two, few, many and other", () => {
    const forms = [1, 2, 3, 11, 100].map((count) =>
      render("ar", TOO_MANY, { label: "الضيوف", count }),
    );
    expect(forms).toEqual([
      "الضيوف يقبل مدخلًا واحدًا على الأكثر.",
      "الضيوف يقبل مدخلين على الأكثر.",
      "الضيوف يقبل 3 مدخلات على الأكثر.",
      "الضيوف يقبل 11 مدخلًا على الأكثر.",
      "الضيوف يقبل 100 مدخل على الأكثر.",
    ]);
  });

  test("Simplified Chinese has the one form its plural rules define", () => {
    expect(render("zh-CN", TOO_FEW, { label: "宾客", count: 7 })).toBe(
      "宾客至少需要 7 项。",
    );
  });

  test("German inflects across one and other", () => {
    expect(render("de", TOO_FEW, { label: "Gäste", count: 1 })).toBe(
      "Gäste braucht mindestens 1 Eintrag.",
    );
    expect(render("de", TOO_FEW, { label: "Gäste", count: 2 })).toBe(
      "Gäste braucht mindestens 2 Einträge.",
    );
  });
});

// In production these render from the compiled `en` catalog, not from the
// descriptors — Lingui ships no ICU parser there. So the catalog's English
// is what a visitor actually reads, and nothing else checks it against the
// message the descriptor was authored with. `i18n:check` compares ids only.
describe("the source catalog", () => {
  test("says the same English the descriptors do", () => {
    const en = catalog("en");
    const source = readFileSync(
      join(process.cwd(), "src", "messages.ts"),
      "utf8",
    );
    const authored = [
      ...source.matchAll(/id: "([^"]+)",\s*\n?\s*message:\s*\n?\s*"(.*)",/g),
    ];
    expect(authored.length).toBeGreaterThan(0);
    for (const [, id, message] of authored) {
      expect(en.get(id ?? ""), `catalog entry for ${id ?? ""}`).toBe(message);
    }
  });
});
