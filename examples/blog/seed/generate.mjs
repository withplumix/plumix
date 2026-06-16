// Generates examples/blog/seed.sql — the demo content for the blog example.
//
// Source of truth is this script (readable JS); the committed artifact is
// seed.sql, applied with wrangler:
//   node seed/generate.mjs                       # regenerate seed.sql
//   wrangler d1 execute plumix_blog --local  --file=seed.sql
//   wrangler d1 execute plumix_blog --remote --file=seed.sql   # live demo
//
// Mirrors the spirit of WordPress's theme-unit-test data: enough posts to
// page, categories + tags (one nested) to fill archives, pages to feed the
// menus, and a typography showcase post that exercises every rendered
// element. Re-runnable: the file resets content tables before re-inserting.

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Fixed clock so regenerating is a no-op diff. Posts walk back from here.
const BASE = Math.floor(Date.UTC(2026, 4, 1) / 1000); // 2026-05-01
const DAY = 86400;

const AUTHOR_ID = 1;
const author = {
  id: AUTHOR_ID,
  email: "editorial@plumix.example",
  name: "The Plumix Editors",
  avatarUrl: "https://i.pravatar.cc/160?img=15",
  role: "admin",
};

const settings = [
  ["site", "title", "The Plumix Gazette"],
  [
    "site",
    "description",
    "Dispatches on design, travel, and the craft of building for the web.",
  ],
];

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------
const categories = [
  {
    id: 1,
    slug: "travel",
    name: "Travel",
    description: "Notes from the road.",
  },
  {
    id: 2,
    slug: "design",
    name: "Design",
    description: "Form, type, and craft.",
  },
  {
    id: 3,
    slug: "engineering",
    name: "Engineering",
    description: "How the thing is built.",
  },
  {
    id: 4,
    slug: "food",
    name: "Food",
    description: "Cooking and eating well.",
  },
  {
    id: 5,
    slug: "culture",
    name: "Culture",
    description: "Books, film, and ideas.",
  },
  // Nested child of Travel — exercises hierarchical category archives.
  {
    id: 6,
    slug: "europe",
    name: "Europe",
    description: "Travel within Europe.",
    parentId: 1,
  },
];

const tags = [
  [10, "lisbon", "Lisbon"],
  [11, "tokyo", "Tokyo"],
  [12, "typography", "Typography"],
  [13, "react", "React"],
  [14, "cloudflare", "Cloudflare"],
  [15, "recipes", "Recipes"],
  [16, "coffee", "Coffee"],
  [17, "photography", "Photography"],
  [18, "minimalism", "Minimalism"],
  [19, "performance", "Performance"],
  [20, "history", "History"],
  [21, "interviews", "Interviews"],
].map(([id, slug, name]) => ({ id, slug, name }));

// ---------------------------------------------------------------------------
// Block helpers — flat blocks render reliably; rich-text carries semantic
// HTML (SSR emits it verbatim), so lists/tables/inline formatting live there.
// ---------------------------------------------------------------------------
let blockSeq = 0;
const bid = () => `b${++blockSeq}`;
const heading = (level, text) => ({
  id: bid(),
  name: "core/heading",
  attrs: { level, text },
});
const richText = (body) => ({
  id: bid(),
  name: "core/rich-text",
  attrs: { body },
});
// The quote block renders `citation` only as the (invisible) `cite=` URL
// attribute, so fold a human attribution into the visible text instead.
const quote = (text, attribution) => ({
  id: bid(),
  name: "core/quote",
  attrs: {
    text: attribution ? `${text} — ${attribution}` : text,
    citation: "",
  },
});
const code = (language, source) => ({
  id: bid(),
  name: "core/code",
  attrs: { language, text: source },
});
const separator = () => ({ id: bid(), name: "core/separator", attrs: {} });
const image = (src, alt, caption) => ({
  id: bid(),
  name: "media/image",
  attrs: { src, alt, caption: caption ?? "", sizing: "full" },
});

const pic = (seed, w = 1200, h = 800) =>
  `https://picsum.photos/seed/plumix-${seed}/${w}/${h}`;

const content = (blocks) => ({ version: "plumix.v2", blocks });

// ---------------------------------------------------------------------------
// Typography showcase — the "Elements" post. Exercises every styled element.
// ---------------------------------------------------------------------------
function showcaseContent() {
  return content([
    richText(
      "<p>This post is a reference for the theme's typography. It exercises every element a writer reaches for, so the styles below double as a visual test sheet — in the spirit of WordPress's theme-unit-test content.</p>",
    ),
    heading(2, "Heading level two"),
    richText(
      '<p>A paragraph with <strong>bold</strong>, <em>italic</em>, <a href="/about">a link</a>, <code>inline code</code>, and <mark>highlighted</mark> text. Lines wrap into a comfortable measure so longer passages stay readable across the column.</p>',
    ),
    heading(3, "Heading level three"),
    richText(
      "<p>Unordered and ordered lists carry their own rhythm:</p><ul><li>Espresso, then water</li><li>Mise en place</li><li>Ship the smallest thing</li></ul><ol><li>Outline the idea</li><li>Draft without stopping</li><li>Edit ruthlessly</li></ol>",
    ),
    quote("Simplicity is the keynote of all true elegance.", "Coco Chanel"),
    heading(3, "Code"),
    richText("<p>Inline <code>const x = 1</code> and a fenced block:</p>"),
    code(
      "typescript",
      "export function greet(name: string): string {\n  return `Hello, ${name}!`;\n}",
    ),
    separator(),
    heading(3, "A table"),
    richText(
      "<table><thead><tr><th>City</th><th>Country</th><th>Known for</th></tr></thead><tbody><tr><td>Lisbon</td><td>Portugal</td><td>Light, tiles, trams</td></tr><tr><td>Tokyo</td><td>Japan</td><td>Density, detail</td></tr><tr><td>Oaxaca</td><td>Mexico</td><td>Mole, mezcal</td></tr></tbody></table>",
    ),
    heading(3, "An image"),
    image(
      pic("elements-figure", 1600, 1000),
      "A wide landscape",
      "Figures carry an optional caption.",
    ),
    richText(
      "<blockquote><p>A plain blockquote, for when the quote block's attribution isn't needed.</p></blockquote><p>And a final paragraph to close the sheet.</p>",
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Regular post bodies — assembled from snippet pools, deterministic per index.
// ---------------------------------------------------------------------------
const intros = [
  "There's a particular pleasure in arriving somewhere with no plan and letting the day unfold.",
  "Good design rarely announces itself; it just quietly makes the right thing easy.",
  "The fastest code is the code that never runs — a lesson the platform keeps reteaching.",
  "A recipe is less a set of rules than a starting point you're meant to argue with.",
  "Every city keeps its real character in the streets the guidebooks skip.",
];
const bodies = [
  "<p>We walked until the map stopped meaning anything, which is usually when the trip actually begins. The light did most of the work; we just tried to keep up.</p>",
  "<p>The constraint turned out to be the feature. Once we stopped fighting it, the interface got smaller, faster, and far easier to explain.</p>",
  "<p>Measurement first, opinions second. The profile disagreed with all of us, and it was right — the hot path wasn't where anyone had guessed.</p>",
  "<p>Salt early, taste often, and trust your hands more than the clock. The best version was the one we made twice.</p>",
];
const pullquotes = [
  ["Travel far enough and you meet yourself.", "David Mitchell"],
  ["Make it work, make it right, make it fast.", "Kent Beck"],
  ["You don't have a recipe, you have a memory.", "A grandmother, somewhere"],
];

function postBody(i) {
  const blocks = [
    richText(`<p>${intros[i % intros.length]}</p>`),
    heading(2, "What we found"),
    richText(bodies[i % bodies.length]),
  ];
  if (i % 3 === 0) {
    const [q, c] = pullquotes[i % pullquotes.length];
    blocks.push(quote(q, c));
  }
  if (i % 4 === 1) {
    blocks.push(image(pic(`post-${i}`), "An illustrative photograph"));
  }
  blocks.push(
    richText(
      "<p>We'll pick this thread up again soon. Until then, the notes above should be enough to retrace our steps.</p>",
    ),
  );
  return content(blocks);
}

// ---------------------------------------------------------------------------
// Posts — 25 total (front page pages at 20/page), spread across taxonomy.
// ---------------------------------------------------------------------------
const POST_TITLES = [
  ["Typography & Elements: a theme test sheet", 2, [12, 18]],
  ["A Slow Morning in Lisbon", 1, [10, 16]],
  ["The Case for Smaller Interfaces", 2, [18, 12]],
  ["Edge Rendering on Cloudflare Workers", 3, [14, 19]],
  ["A Weeknight Ragu Worth the Wait", 4, [15]],
  ["Tokyo, in Side Streets", 1, [11, 17]],
  ["Designing With System Fonts", 2, [12, 18]],
  ["Why We Dropped the Build Step", 3, [13, 19]],
  ["Coffee, Three Ways", 4, [16, 15]],
  ["On Rereading Old Notebooks", 5, [20]],
  ["The Tram 28 Diaries", 6, [10, 17]],
  ["A Render Budget You Can Keep", 3, [19, 14]],
  ["Markets of Oaxaca", 1, [15, 17]],
  ["Less Chrome, More Content", 2, [18]],
  ["Interviewing the Maintainers", 5, [21, 13]],
  ["Lisbon's Miradouros, Ranked", 6, [10]],
  ["The Quiet Power of Defaults", 2, [18, 12]],
  ["Shipping on a Friday (Carefully)", 3, [19]],
  ["A Pantry That Cooks Itself", 4, [15]],
  ["Notes on Black-and-White Photography", 5, [17, 20]],
  ["Trains, Not Planes", 6, [10, 11]],
  ["Caching Without Tears", 3, [14, 19]],
  ["The Sourdough Detour", 4, [15, 16]],
  ["A Reading List for the Off-Season", 5, [20, 21]],
  ["Packing Light, Thinking Light", 1, [18, 10]],
];

const POST_BASE_ID = 200;
const posts = POST_TITLES.map(([title, categoryId, tagIds], i) => {
  const slug = title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return {
    id: POST_BASE_ID + i,
    title,
    slug,
    excerpt: intros[i % intros.length],
    content: i === 0 ? showcaseContent() : postBody(i),
    categoryId,
    tagIds,
    featured: pic(`cover-${slug}`),
    publishedAt: BASE - i * 3 * DAY,
  };
});

// ---------------------------------------------------------------------------
// Pages — hierarchical (Team nests under About), feed the menus.
// ---------------------------------------------------------------------------
const pages = [
  {
    id: 100,
    slug: "about",
    title: "About",
    parentId: null,
    content: content([
      richText(
        "<p>The Plumix Gazette is a demo publication built to show off the Plumix starter theme — a small, fast, content-first stack running on Cloudflare Workers.</p>",
      ),
      heading(2, "What you'll find here"),
      richText(
        "<p>Essays on travel, design, engineering, and food, plus the occasional interview. None of it is real; all of it is here to make the theme look like a living site.</p>",
      ),
    ]),
  },
  {
    id: 101,
    slug: "team",
    title: "The Team",
    parentId: 100,
    content: content([
      richText(
        "<p>A masthead of exactly one: the editor, plus a generous amount of imagination.</p>",
      ),
    ]),
  },
  {
    id: 102,
    slug: "contact",
    title: "Contact",
    parentId: null,
    content: content([
      richText(
        '<p>Reach the newsroom at <a href="mailto:hello@plumix.example">hello@plumix.example</a>. We read everything and reply to most.</p>',
      ),
    ]),
  },
];

// ---------------------------------------------------------------------------
// Menus — terms in the "menu" taxonomy keyed by location slug; items are
// menu_item entries joined to the menu term, with kind=custom|entry|term.
// ---------------------------------------------------------------------------
const MENU_PRIMARY = 30;
const MENU_FOOTER = 31;
const menuTerms = [
  { id: MENU_PRIMARY, slug: "primary", name: "Primary" },
  { id: MENU_FOOTER, slug: "footer", name: "Footer" },
];

let menuItemSeq = 300;
const menuItems = [];
const addItem = (menuId, title, meta) =>
  menuItems.push({
    id: menuItemSeq++,
    menuId,
    title,
    sortOrder: menuItems.filter((m) => m.menuId === menuId).length,
    meta,
  });

// Lean header (the logo links home): three category links. These exercise
// the "term" menu-item kind.
addItem(MENU_PRIMARY, "Travel", { kind: "term", termId: 1 });
addItem(MENU_PRIMARY, "Design", { kind: "term", termId: 2 });
addItem(MENU_PRIMARY, "Engineering", { kind: "term", termId: 3 });

// All pages live in the footer ("entry" kind), plus a custom external link.
addItem(MENU_FOOTER, "About", { kind: "entry", entryId: 100 });
addItem(MENU_FOOTER, "Contact", { kind: "entry", entryId: 102 });
addItem(MENU_FOOTER, "Source", {
  kind: "custom",
  url: "https://github.com/withplumix/plumix",
  target: "_blank",
});

// ---------------------------------------------------------------------------
// SQL emission
// ---------------------------------------------------------------------------
const q = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};
const json = (obj) => q(JSON.stringify(obj));

const lines = [];
const emit = (s) => lines.push(s);

emit("-- Generated by seed/generate.mjs — do not edit by hand.");
emit("-- Apply with: wrangler d1 execute plumix_blog --local --file=seed.sql");
emit("");
emit("PRAGMA foreign_keys = ON;");
emit("");
emit("-- Reset demo content (leaves users/auth intact).");
emit("DELETE FROM entry_term;");
emit("DELETE FROM entries;");
emit("DELETE FROM terms;");
emit("DELETE FROM settings WHERE \"group\" = 'site';");
emit("");

emit("-- Author");
emit(
  `INSERT OR IGNORE INTO users (id, email, name, avatar_url, role, meta) VALUES (${author.id}, ${q(author.email)}, ${q(author.name)}, ${q(author.avatarUrl)}, ${q(author.role)}, '{}');`,
);
emit("");

emit("-- Settings");
for (const [group, key, value] of settings) {
  emit(
    `INSERT INTO settings ("group", "key", "value") VALUES (${q(group)}, ${q(key)}, ${json(value)});`,
  );
}
emit("");

emit("-- Categories + tags (+ nested category)");
for (const c of [...categories, ...menuTerms]) {
  const taxonomy = menuTerms.includes(c) ? "menu" : "category";
  emit(
    `INSERT INTO terms (id, taxonomy, name, slug, description, meta, parent_id, version) VALUES (${c.id}, ${q(taxonomy)}, ${q(c.name)}, ${q(c.slug)}, ${q(c.description ?? null)}, '{}', ${q(c.parentId ?? null)}, 0);`,
  );
}
for (const t of tags) {
  emit(
    `INSERT INTO terms (id, taxonomy, name, slug, description, meta, parent_id, version) VALUES (${t.id}, 'tag', ${q(t.name)}, ${q(t.slug)}, NULL, '{}', NULL, 0);`,
  );
}
emit("");

const insertEntry = (e) => {
  const meta =
    e.meta ??
    (e.featured
      ? {
          featuredImage: {
            src: e.featured,
            alt: e.title,
            width: 1200,
            height: 800,
          },
        }
      : {});
  emit(
    `INSERT INTO entries (id, type, parent_id, title, slug, content, excerpt, status, author_id, sort_order, meta, published_at) VALUES (${e.id}, ${q(e.type)}, ${q(e.parentId ?? null)}, ${q(e.title)}, ${q(e.slug)}, ${json(e.content)}, ${q(e.excerpt ?? null)}, 'published', ${AUTHOR_ID}, ${e.sortOrder ?? 0}, ${json(meta)}, ${e.publishedAt});`,
  );
};

emit("-- Pages");
for (const p of pages) insertEntry({ ...p, type: "page", publishedAt: BASE });
emit("");

emit("-- Posts");
for (const p of posts) insertEntry({ ...p, type: "post" });
emit("");

emit("-- Menu items (meta carries the link target: custom url / entry / term)");
for (const m of menuItems) {
  insertEntry({
    id: m.id,
    type: "menu_item",
    title: m.title,
    slug: `menu-item-${m.id}`,
    content: null,
    parentId: null,
    sortOrder: m.sortOrder,
    meta: m.meta,
    publishedAt: BASE,
  });
}
emit("");

emit("-- Term assignments (post -> category + tags)");
for (const p of posts) {
  emit(
    `INSERT INTO entry_term (entry_id, term_id, sort_order) VALUES (${p.id}, ${p.categoryId}, 0);`,
  );
  p.tagIds.forEach((termId, i) =>
    emit(
      `INSERT INTO entry_term (entry_id, term_id, sort_order) VALUES (${p.id}, ${termId}, ${i});`,
    ),
  );
}
emit("");

emit("-- Menu item -> menu term joins");
for (const m of menuItems) {
  emit(
    `INSERT INTO entry_term (entry_id, term_id, sort_order) VALUES (${m.id}, ${m.menuId}, ${m.sortOrder});`,
  );
}
emit("");

const out = fileURLToPath(new URL("../seed.sql", import.meta.url));
await writeFile(out, lines.join("\n") + "\n", "utf8");
console.log(
  `wrote ${out}: ${posts.length} posts, ${pages.length} pages, ${categories.length} categories, ${tags.length} tags, ${menuItems.length} menu items`,
);
