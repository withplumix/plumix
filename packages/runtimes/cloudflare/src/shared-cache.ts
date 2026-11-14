/**
 * The named entrypoint Workers Caching sits in front of. The generated entry
 * defines it, and a site's wrangler config turns its cache on by this name.
 */
export const SHARED_CACHE_ENTRYPOINT = "PlumixSharedCache";

/**
 * Cloudflare APO's marketing parameters
 * (https://developers.cloudflare.com/automatic-platform-optimization/reference/query-parameters/),
 * plus Microsoft Ads' `msclkid`. They never change the page, so one copy
 * serves every campaign link.
 */
const MARKETING_PARAMETERS = new Set([
  "ref",
  "fbclid",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  "mc_cid",
  "mc_eid",
  "gclid",
  "dclid",
  "msclkid",
  "_ga",
  "campaignid",
  "adgroupid",
  "_ke",
  "cn-reloaded",
  "age-verified",
  "ao_noptimize",
  "usqp",
  "mkt_tok",
  "epik",
  "ck_subscriber_id",
]);

function isMarketingParameter(name: string): boolean {
  return name.startsWith("utm_") || MARKETING_PARAMETERS.has(name);
}

/**
 * What the gateway hands the cached entrypoint. The URL is the cache key, so
 * it drops cookies and marketing parameters and sorts the rest.
 */
export function sharedCacheRequest(request: Request): Request {
  const url = new URL(request.url);
  for (const name of [...url.searchParams.keys()]) {
    if (isMarketingParameter(name)) url.searchParams.delete(name);
  }
  url.searchParams.sort();
  const forwarded = new Request(url, request);
  forwarded.headers.delete("cookie");
  return forwarded;
}
