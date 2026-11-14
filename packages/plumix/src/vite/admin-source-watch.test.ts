import {
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import type { AdminSourceWatch } from "./admin-source-watch.js";
import { watchAdminSources } from "./admin-source-watch.js";

let dir: string;
let admin: string;
let sources: AdminSourceWatch;
const onChange = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  dir = realpathSync(mkdtempSync(join(tmpdir(), "plumix-admin-watch-")));
  admin = join(dir, "admin.js");
  writeFileSync(admin, "export const marker = 'before';\n");
  sources = watchAdminSources(onChange);
});

afterEach(() => {
  sources.close();
  onChange.mockReset();
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

test("reports an edit made as soon as the watch returns", () => {
  sources.watch([admin]);

  writeFileSync(admin, "export const marker = 'after';\n");
  vi.advanceTimersByTime(100);

  expect(onChange).toHaveBeenCalledOnce();
});

test("reports nothing while the watched files stay the same", () => {
  sources.watch([admin]);

  vi.advanceTimersByTime(300);

  expect(onChange).not.toHaveBeenCalled();
});

test("reports one edit once", () => {
  sources.watch([admin]);

  writeFileSync(admin, "export const marker = 'after';\n");
  vi.advanceTimersByTime(300);

  expect(onChange).toHaveBeenCalledOnce();
});

test("reports a file an editor replaced with a rename", () => {
  sources.watch([admin]);
  writeFileSync(join(dir, "admin.tmp"), "export const marker = 'saved';\n");

  renameSync(join(dir, "admin.tmp"), admin);
  vi.advanceTimersByTime(100);

  expect(onChange).toHaveBeenCalledOnce();
});

test("reports nothing once closed", () => {
  sources.watch([admin]);
  sources.close();

  writeFileSync(admin, "export const marker = 'after';\n");
  vi.advanceTimersByTime(300);

  expect(onChange).not.toHaveBeenCalled();
});
