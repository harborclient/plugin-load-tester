import type { PluginContext } from '@harborclient/sdk';

const SCHEMA_VERSION = 1;

/**
 * Initializes the plugin database schema for optional run history storage.
 *
 * Results for the active session are kept in memory; this schema supports future
 * persistence and matches the plugin design notes in HarborClient docs.
 *
 * @param hc - Renderer plugin context from HarborClient.
 */
export async function initDatabase(hc: PluginContext): Promise<void> {
  await hc.database.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_key TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      count INTEGER NOT NULL,
      concurrency INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      at INTEGER NOT NULL,
      duration_ms REAL NOT NULL,
      status INTEGER,
      error TEXT,
      request_name TEXT,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );
  `);

  const row = await hc.database.get<{ value: number }>(
    'SELECT value FROM schema_meta WHERE key = ?',
    ['version']
  );
  if (!row) {
    await hc.database.run('INSERT INTO schema_meta (key, value) VALUES (?, ?)', [
      'version',
      SCHEMA_VERSION
    ]);
  }
}
