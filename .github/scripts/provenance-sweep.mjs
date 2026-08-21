// One-time provenance audit sweep — a discovery tool, NOT a CI gate.
//
// Walks the source tree for "we copied/adapted upstream code" markers and
// reports any that name a copied upstream but are not covered by the root
// NOTICE. It exists to prove the NOTICE is complete during the provenance work
// (and to re-run if you suspect drift); it is intentionally not wired into CI.
//
// Idea-level parity (e.g. GPL WordPress) and dependency-divergence notes (e.g.
// the oslojs reimpl) are deliberately never reported: they name no *copied*
// upstream, so `collectUnaccounted` skips them.
//
// Scope + heuristics (fine for a one-time tool, stated so a re-run isn't
// misread): it scans packages/*/src only, and treats a marker as real
// derivation only when a copied phrase and the upstream name sit in the same
// clause within ~40 chars, phrase before name. Reordered or long-winded
// phrasings can slip through — eyeball the diff, don't trust it blindly.
//
// Run:   node .github/scripts/provenance-sweep.mjs
// Tests: node --test .github/scripts/provenance-sweep.test.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Phrases that signal COPIED / ADAPTED upstream code (attribution owed). One
// source of truth, consumed both as a regex array (the first-pass marker
// filter) and as an alternation inside the adjacency check below.
const COPIED_PHRASE_SOURCES = [
  "port(?:ed)? of",
  "ported from",
  "adapted from",
  "derived from",
  "lifted from",
  "copied from",
  "vendored",
];
export const COPIED_PHRASES = COPIED_PHRASE_SOURCES.map(
  (s) => new RegExp(`\\b${s}\\b`, "i"),
);

// Phrases that signal idea-level influence (no code copied, no attribution).
export const IDEA_PHRASES = [
  /\bidea (borrowed|from)\b/i,
  /\binspired by\b/i,
  /\bbehaviou?ral parity\b/i,
  /\bwe studied\b/i,
  /\bimplementations we studied\b/i,
];

function isCovered(file, coveredFiles) {
  return coveredFiles.some((entry) =>
    entry.endsWith("/") ? file.startsWith(entry) : file === entry,
  );
}

const COPIED_PHRASE_ALT = `\\b(?:${COPIED_PHRASE_SOURCES.join("|")})\\b`;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// True only when a copied phrase sits in the SAME clause as the upstream name
// (no sentence break between them). This is what separates real derivation
// ("port of Astro") from a contrast mention ("a lever Astro/Nuxt lack … derived
// from the registry") or a re-export barrel that merely describes vendored code.
function namesCopiedUpstreamAdjacent(text, copiedUpstreams) {
  return copiedUpstreams.some((u) =>
    new RegExp(`${COPIED_PHRASE_ALT}[^.]{0,40}${escapeRegExp(u)}`, "i").test(
      text,
    ),
  );
}

/**
 * Pure collector — the tested seam.
 *
 * @param {{ file: string, text: string }[]} markers  comment text per file
 * @param {{ copiedUpstreams: string[], noticeCoveredFiles: string[] }} manifest
 * @returns {{ file: string, text: string }[]}
 */
export function collectUnaccounted(markers, manifest) {
  const { copiedUpstreams, noticeCoveredFiles } = manifest;
  const out = [];
  for (const { file, text } of markers) {
    if (!COPIED_PHRASES.some((re) => re.test(text))) continue;
    if (IDEA_PHRASES.some((re) => re.test(text))) continue;
    if (!namesCopiedUpstreamAdjacent(text, copiedUpstreams)) continue;
    if (isCovered(file, noticeCoveredFiles)) continue;
    out.push({ file, text });
  }
  return out;
}

/** Exact-file NOTICE entries (not folder entries) that no longer exist. */
export function collectStale(noticeCoveredFiles, fileExists) {
  return noticeCoveredFiles
    .filter((entry) => !entry.endsWith("/"))
    .filter((entry) => !fileExists(entry));
}

// ---- CLI wrapper (impure): gather real inputs, run the collector, report. ----

function parseNotice(noticeText) {
  // Anchor on the exact section-header lines (no leading indent, nothing after),
  // NOT the indented intro bullets that also read "1. Copied / adapted code — …".
  const start = noticeText.search(/^1\. Copied \/ adapted code$/m);
  const end = noticeText.search(/^2\. Dependency divergence$/m);
  if (start === -1) {
    throw new Error(
      "NOTICE: could not find the '1. Copied / adapted code' section header",
    );
  }
  const section = noticeText.slice(start, end === -1 ? undefined : end);
  const copiedUpstreams = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^(\S[^—\n]*?)\s+—\s+MIT\b/);
    if (m) copiedUpstreams.push(m[1].trim());
  }
  const noticeCoveredFiles = [...section.matchAll(/packages\/[^\s():]+/g)].map(
    (m) => m[0],
  );
  return { copiedUpstreams, noticeCoveredFiles };
}

function extractComments(source) {
  return source
    .split("\n")
    .filter((line) => /^\s*(\/\/|\*|\/\*)/.test(line))
    .map((line) => line.replace(/^\s*(\/\/+|\*+|\/\*)/, "").trim())
    .join(" ");
}

function walk(dir, acc) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist") continue;
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(full, acc);
    } else if (
      /\.(ts|tsx)$/.test(ent.name) &&
      !/\.test\.(ts|tsx)$/.test(ent.name)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

function main() {
  const notice = readFileSync("NOTICE", "utf8");
  const manifest = parseNotice(notice);

  const markers = [];
  for (const dir of readdirSync("packages")) {
    const src = join("packages", dir, "src");
    if (!existsSync(src)) continue;
    for (const file of walk(src, [])) {
      const text = extractComments(readFileSync(file, "utf8"));
      if (COPIED_PHRASES.some((re) => re.test(text)))
        markers.push({ file, text });
    }
  }

  const unaccounted = collectUnaccounted(markers, manifest);
  const stale = collectStale(manifest.noticeCoveredFiles, existsSync);

  if (unaccounted.length === 0 && stale.length === 0) {
    console.log(
      `Provenance sweep clean — scanned ${markers.length} file(s) with a copied-code phrase; no uncovered derivation found.`,
    );
    return;
  }
  if (unaccounted.length > 0) {
    console.error("Copied-code markers not covered by NOTICE:\n");
    for (const v of unaccounted)
      console.error(`  ${v.file}\n    ${v.text.slice(0, 120)}`);
  }
  if (stale.length > 0) {
    console.error("\nNOTICE lists files that no longer exist:\n");
    for (const f of stale) console.error(`  ${f}`);
  }
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
