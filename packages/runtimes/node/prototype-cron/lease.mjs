// PROTOTYPE — throwaway. VARIANT B's lock: a lease row in the site's own
// SQLite file. Cross-process, no new dependency, no shared store (#2249).
import { DatabaseSync } from "node:sqlite";

const DDL = `
  CREATE TABLE IF NOT EXISTS plumix_scheduled_leases (
    key         TEXT PRIMARY KEY,
    holder      TEXT NOT NULL,
    expires_at  INTEGER NOT NULL
  ) STRICT;
`;

export function sqliteLease({ path, holder, ttlMs = 60_000, now = Date.now, log = () => {} }) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec(DDL);

  // One statement, atomic: insert if absent, steal only if expired or ours.
  // A live holder's row fails the WHERE and changes 0 rows.
  const acquire = db.prepare(`
    INSERT INTO plumix_scheduled_leases (key, holder, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET holder = excluded.holder, expires_at = excluded.expires_at
    WHERE plumix_scheduled_leases.expires_at <= ?
       OR plumix_scheduled_leases.holder = excluded.holder
  `);
  const heartbeat = db.prepare(
    `UPDATE plumix_scheduled_leases SET expires_at = ? WHERE key = ? AND holder = ?`,
  );
  const release = db.prepare(
    `DELETE FROM plumix_scheduled_leases WHERE key = ? AND holder = ?`,
  );

  return {
    async run(key, fn) {
      const t = now();
      const { changes } = acquire.run(key, holder, t + ttlMs, t);
      if (changes === 0) return "held";
      // A run longer than the TTL must not let a second process steal the
      // lease mid-run, so the holder renews while it works.
      const beat = setInterval(() => {
        heartbeat.run(now() + ttlMs, key, holder);
      }, Math.max(1, Math.floor(ttlMs / 3)));
      beat.unref?.();
      try {
        await fn();
        return "ran";
      } finally {
        clearInterval(beat);
        release.run(key, holder);
      }
    },
    close: () => db.close(),
  };
}
