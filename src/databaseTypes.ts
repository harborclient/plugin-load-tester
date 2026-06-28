/**
 * Minimal plugin database surface used by this plugin.
 */
export interface PluginDatabase {
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(
    sql: string,
    params?: unknown[]
  ): Promise<{ changes: number; lastInsertRowid: number | string }>;
  exec(sql: string): Promise<void>;
}

declare module '@harborclient/sdk' {
  interface PluginContext {
    database: PluginDatabase;
  }

  interface PluginHost {
    /**
     * Clears the active request tab's last HTTP response so plugin-only response
     * views can take over the panel.
     */
    clearResponse(): Promise<void>;
  }
}

export {};
