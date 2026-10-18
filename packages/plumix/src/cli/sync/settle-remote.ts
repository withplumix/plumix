import type { SyncAfterEvent, SyncSettleReport } from "@plumix/core";

import { remoteDeps, resolveApiToken, urlUnder } from "../api-token.js";
import { PlumixCliError } from "../errors.js";

const SETTLE_PATH = "_plumix/api/v1/system/sync/settle";

/**
 * A remote end's settle: core's `settleSync` run inside the deployed site at
 * `url`, with the API token `PLUMIX_API_TOKEN` or the site's device flow gives.
 */
export async function settleDeployedSite(
  url: string,
  event: SyncAfterEvent,
): Promise<SyncSettleReport> {
  const token = await resolveApiToken({
    url,
    token: undefined,
    missing: () => PlumixCliError.syncSettleTokenMissing(),
  });
  const response = await remoteDeps.fetch(urlUnder(url, SETTLE_PATH), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(event),
  });
  if (!response.ok) {
    throw PlumixCliError.syncSettleRefused({
      status: response.status,
      body: await response.text(),
    });
  }
  return (await response.json()) as SyncSettleReport;
}
