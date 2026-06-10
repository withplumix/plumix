import { afterEach, describe, expect, test } from "vitest";

import type { PaletteCommand } from "./palette-commands.js";
import { labelText as text } from "../../test/label-text.js";
import {
  _resetPaletteCommands,
  getRegisteredPaletteCommands,
  registerPaletteCommand,
  selectCommands,
} from "./palette-commands.js";

const noop = (): void => undefined;

function cmd(
  id: string,
  message: string,
  extra: Partial<PaletteCommand> = {},
): PaletteCommand {
  return { id, title: { id, message }, run: noop, ...extra };
}

afterEach(() => {
  _resetPaletteCommands();
});

describe("selectCommands", () => {
  const commands = [
    cmd("a", "Create post"),
    cmd("b", "Settings", { capability: "settings:manage" }),
  ];

  test("hides commands whose capability the user lacks", () => {
    expect(selectCommands(commands, [], "", text).map((c) => c.id)).toEqual([
      "a",
    ]);
  });

  test("shows capability-gated commands once the user has the cap", () => {
    const ids = selectCommands(commands, ["settings:manage"], "", text).map(
      (c) => c.id,
    );
    expect(ids).toEqual(["a", "b"]);
  });

  test("filters by query against the resolved title", () => {
    const ids = selectCommands(commands, ["settings:manage"], "set", text).map(
      (c) => c.id,
    );
    expect(ids).toEqual(["b"]);
  });

  test("matches query against keywords too", () => {
    const withKeyword = [cmd("a", "Create post", { keywords: ["new", "add"] })];
    expect(
      selectCommands(withKeyword, [], "add", text).map((c) => c.id),
    ).toEqual(["a"]);
  });
});

describe("palette command registry", () => {
  test("registers a command and exposes it", () => {
    registerPaletteCommand(cmd("plugin:x", "Do X"));
    expect(getRegisteredPaletteCommands().map((c) => c.id)).toEqual([
      "plugin:x",
    ]);
  });

  test("rejects a duplicate id", () => {
    registerPaletteCommand(cmd("plugin:x", "Do X"));
    expect(() => registerPaletteCommand(cmd("plugin:x", "Again"))).toThrow();
  });
});
