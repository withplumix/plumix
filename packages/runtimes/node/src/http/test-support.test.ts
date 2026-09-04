import { expect, test } from "vitest";

import { listen } from "./test-support.js";

test("listen binds a loopback port that answers", async () => {
  const { origin, port } = await listen((_req, res) => res.end("up"));
  expect(origin).toBe(`http://127.0.0.1:${port}`);
  expect(await (await fetch(origin)).text()).toBe("up");
});
