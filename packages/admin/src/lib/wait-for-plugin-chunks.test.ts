import { afterEach, describe, expect, test } from "vitest";

import { waitForPluginChunks } from "./wait-for-plugin-chunks.js";

afterEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
});

function appendPluginScript(id: string): HTMLScriptElement {
  const script = document.createElement("script");
  script.type = "module";
  script.dataset.plumixPlugin = id;
  script.src = `/plugins/${id}.js`;
  document.body.appendChild(script);
  return script;
}

function settled<T>(promise: Promise<T>): Promise<"settled" | "pending"> {
  return Promise.race([
    promise.then(() => "settled" as const),
    new Promise<"pending">((resolve) => {
      setTimeout(() => resolve("pending"), 10);
    }),
  ]);
}

describe("waitForPluginChunks", () => {
  test("resolves immediately when no plugin chunks are present", async () => {
    await expect(waitForPluginChunks()).resolves.toBeUndefined();
  });

  test("ignores non-plugin script tags", async () => {
    const other = document.createElement("script");
    other.src = "/other.js";
    document.body.appendChild(other);
    await expect(waitForPluginChunks()).resolves.toBeUndefined();
  });

  test("ignores plugin <link rel=stylesheet> tags", async () => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.plumixPlugin = "media";
    link.href = "/plugins/media.css";
    document.head.appendChild(link);
    await expect(waitForPluginChunks()).resolves.toBeUndefined();
  });

  test("waits until every plugin script fires load", async () => {
    const a = appendPluginScript("media");
    const b = appendPluginScript("menus");
    const promise = waitForPluginChunks();

    expect(await settled(promise)).toBe("pending");

    a.dispatchEvent(new Event("load"));
    expect(await settled(promise)).toBe("pending");

    b.dispatchEvent(new Event("load"));
    expect(await settled(promise)).toBe("settled");
  });

  test("treats error as settled so a broken plugin does not block the admin", async () => {
    const broken = appendPluginScript("broken");
    const ok = appendPluginScript("ok");
    const promise = waitForPluginChunks();

    broken.dispatchEvent(new Event("error"));
    ok.dispatchEvent(new Event("load"));

    await expect(promise).resolves.toBeUndefined();
  });
});
