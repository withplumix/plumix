import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import { catalogFromPo } from "./po-catalog.js";

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function poFile(content: string): Promise<URL> {
  dir = await mkdtemp(join(tmpdir(), "plumix-po-"));
  const path = join(dir, "en.po");
  await writeFile(path, content);
  return pathToFileURL(path);
}

describe("catalogFromPo", () => {
  test("reads multi-line and escaped strings, compiling placeholders", async () => {
    const path = await poFile(
      [
        'msgid "Hello {name}"',
        'msgstr "Привіт {name}"',
        "",
        'msgid ""',
        '"Say \\"hi\\""',
        'msgstr "Скажи "',
        '"\\"привіт\\""',
      ].join("\n"),
    );

    expect(catalogFromPo(path)).toEqual({
      "Hello {name}": ["Привіт ", ["name"]],
      'Say "hi"': 'Скажи "привіт"',
    });
  });

  test("reads a msgid of repeated empty strings in linear time", async () => {
    const path = await poFile(`msgid "${'""'.repeat(24)}`);

    const started = performance.now();
    expect(catalogFromPo(path)).toEqual({});
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
