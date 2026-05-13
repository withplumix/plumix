-- Smoke-test fixtures for examples/blog e2e. Just enough rows to make
-- each public route shape resolve through the dispatcher — the
-- routing/resolver edge cases live in the unit tests, this suite only
-- proves the wrangler+vite+worker stack composes correctly.
--
-- Run via `wrangler d1 execute plumix_blog --local --file=e2e/seed.sql`
-- after migrations have been applied.

INSERT INTO users (id, email, name, role, email_verified_at) VALUES
  (1, 'admin@example.test', 'Admin', 'admin', unixepoch());

-- One flat category, one flat tag, plus a `europe → france`
-- hierarchical category pair for the nested taxonomy URL.
INSERT INTO terms (id, taxonomy, name, slug, parent_id) VALUES
  (1, 'category', 'News', 'news', NULL),
  (3, 'category', 'Europe', 'europe', NULL),
  (4, 'category', 'France', 'france', 3),
  (10, 'tag', 'Featured', 'featured', NULL);

-- Hierarchical pages (about → team) for the entry-type path-chain.
INSERT INTO entries (id, type, slug, title, status, author_id, parent_id, published_at) VALUES
  (100, 'page', 'about', 'About', 'published', 1, NULL, unixepoch()),
  (101, 'page', 'team', 'Team', 'published', 1, 100, unixepoch());

-- One post per term so each archive renders a non-empty body.
INSERT INTO entries (id, type, slug, title, status, author_id, published_at) VALUES
  (200, 'post', 'hello-news', 'Hello News', 'published', 1, unixepoch()),
  (201, 'post', 'featured-post', 'Featured Post', 'published', 1, unixepoch()),
  (202, 'post', 'france-wine', 'France Wine', 'published', 1, unixepoch());

INSERT INTO entry_term (entry_id, term_id) VALUES
  (200, 1),  -- hello-news → News
  (201, 10), -- featured-post → Featured tag
  (202, 4);  -- france-wine → France (nested under Europe)
