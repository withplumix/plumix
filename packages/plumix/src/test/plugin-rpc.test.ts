import { beforeEach, vi } from "vitest";

import { describeStubPluginRpc } from "../../test/plugin-rpc-cases.js";

// Node has no `location`; the client builds its URL from one.
beforeEach(() => {
  vi.stubGlobal("location", new URL("https://cms.example/admin"));
});

describeStubPluginRpc();
