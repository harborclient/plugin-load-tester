import { useSyncExternalStore } from '@harborclient/sdk/react';
import type { PluginContext } from '@harborclient/sdk';
import { asRecord, recordOf } from '@harborclient/sdk/storage';
import {
  createExternalStore,
  createStorageStore,
  type StorageStore
} from '@harborclient/sdk/store';
import type { LoadAggregate, LoadProgress, LoadTestConfig } from './types';

/** Storage key for completed load test aggregates keyed by request key. */
export const RESULTS_STORAGE_KEY = 'load-results';

/** Storage key for in-flight load test progress keyed by request key. */
export const PROGRESS_STORAGE_KEY = 'load-progress';

/** Default load test configuration for new runs. */
export const DEFAULT_LOAD_TEST_CONFIG: LoadTestConfig = {
  count: 10,
  concurrency: 1,
  timeoutMs: 30_000,
  delayMs: 0,
  keepAlive: true
};

let defaultConfigStore = createExternalStore<LoadTestConfig>({ ...DEFAULT_LOAD_TEST_CONFIG });
let resultsStore: StorageStore<Record<string, LoadAggregate>> | null = null;
let progressStore: StorageStore<Record<string, LoadProgress>> | null = null;
const abortControllers = new Map<string, AbortController>();

/**
 * Serializes results keyed by request key for plugin storage.
 *
 * @param source - Current results keyed by request key.
 */
export function serializeResultsRecord(
  source: Record<string, LoadAggregate> | Map<string, LoadAggregate>
): Record<string, LoadAggregate> {
  return source instanceof Map ? Object.fromEntries(source.entries()) : source;
}

/**
 * Serializes progress keyed by request key for plugin storage.
 *
 * @param source - Current progress keyed by request key.
 */
export function serializeProgressRecord(
  source: Record<string, LoadProgress> | Map<string, LoadProgress>
): Record<string, LoadProgress> {
  return source instanceof Map ? Object.fromEntries(source.entries()) : source;
}

/**
 * Returns true when a value matches the {@link LoadAggregate} shape.
 *
 * @param value - Candidate value from storage.
 */
function isLoadAggregate(value: unknown): value is LoadAggregate {
  const record = asRecord(value);
  if (!record) {
    return false;
  }
  return (
    typeof record.startedAt === 'number' &&
    typeof record.finishedAt === 'number' &&
    typeof record.total === 'number' &&
    Array.isArray(record.samples)
  );
}

/**
 * Returns true when a value matches the {@link LoadProgress} shape.
 *
 * @param value - Candidate value from storage.
 */
function isLoadProgress(value: unknown): value is LoadProgress {
  const record = asRecord(value);
  if (!record) {
    return false;
  }
  return (
    typeof record.completed === 'number' &&
    typeof record.total === 'number' &&
    typeof record.running === 'boolean'
  );
}

/**
 * Normalizes a stored record into a string-keyed map of aggregates.
 *
 * @param stored - Raw value from plugin storage.
 */
export function hydrateResultsRecord(stored: unknown): Record<string, LoadAggregate> {
  return recordOf(stored, isLoadAggregate);
}

/**
 * Normalizes a stored record into a string-keyed map of progress snapshots.
 *
 * @param stored - Raw value from plugin storage.
 */
export function hydrateProgressRecord(stored: unknown): Record<string, LoadProgress> {
  return recordOf(stored, isLoadProgress);
}

/**
 * Returns the initialized results store.
 */
function requireResultsStore(): StorageStore<Record<string, LoadAggregate>> {
  if (!resultsStore) {
    throw new Error('Load tester store is not initialized.');
  }
  return resultsStore;
}

/**
 * Returns the initialized progress store.
 */
function requireProgressStore(): StorageStore<Record<string, LoadProgress>> {
  if (!progressStore) {
    throw new Error('Load tester store is not initialized.');
  }
  return progressStore;
}

/**
 * Initializes the store with the plugin context and hydrates from storage.
 *
 * @param context - Renderer plugin context from HarborClient.
 */
export async function initStore(context: PluginContext): Promise<void> {
  resultsStore = createStorageStore({
    storage: context.storage,
    key: RESULTS_STORAGE_KEY,
    parse: hydrateResultsRecord
  });
  progressStore = createStorageStore({
    storage: context.storage,
    key: PROGRESS_STORAGE_KEY,
    parse: hydrateProgressRecord
  });
  defaultConfigStore = createExternalStore({ ...DEFAULT_LOAD_TEST_CONFIG });
  await Promise.all([resultsStore.reloadFromStorage(), progressStore.reloadFromStorage()]);
}

/**
 * Aborts active runs and clears module-level store state on plugin deactivation.
 *
 * Push onto {@link PluginContext.subscriptions} from {@link activate} so the host
 * tears down singletons when the plugin reloads or disables.
 */
export function disposeStore(): void {
  for (const controller of abortControllers.values()) {
    controller.abort();
  }
  abortControllers.clear();
  resultsStore = null;
  progressStore = null;
  defaultConfigStore = createExternalStore({ ...DEFAULT_LOAD_TEST_CONFIG });
}

/**
 * Returns the storage-backed results store after {@link initStore}.
 */
export function getResultsStore(): StorageStore<Record<string, LoadAggregate>> {
  return requireResultsStore();
}

/**
 * Returns the storage-backed progress store after {@link initStore}.
 */
export function getProgressStore(): StorageStore<Record<string, LoadProgress>> {
  return requireProgressStore();
}

/**
 * Reloads load test results and progress from persisted plugin storage.
 *
 * Separate plugin webviews do not share in-memory state; call this after another
 * surface writes storage (for example when the request tab completes a run).
 */
export async function reloadFromStorage(): Promise<void> {
  await Promise.all([resultsStore?.reloadFromStorage(), progressStore?.reloadFromStorage()]);
}

/**
 * Replaces the in-memory results snapshot from a hydrated record.
 *
 * @param record - Stored results keyed by request key.
 */
export async function applyResultsRecord(record: Record<string, LoadAggregate>): Promise<void> {
  await requireResultsStore().set(record);
}

/**
 * Replaces the in-memory progress snapshot from a hydrated record.
 *
 * @param record - Stored progress keyed by request key.
 */
export async function applyProgressRecord(record: Record<string, LoadProgress>): Promise<void> {
  await requireProgressStore().set(record);
}

/**
 * Normalizes persisted or user-edited load test configuration.
 *
 * @param input - Raw configuration values.
 */
export function normalizeConfig(input: Partial<LoadTestConfig>): LoadTestConfig {
  return {
    count: clampInt(input.count, 1, 10_000, DEFAULT_LOAD_TEST_CONFIG.count),
    concurrency: clampInt(input.concurrency, 1, 500, DEFAULT_LOAD_TEST_CONFIG.concurrency),
    timeoutMs: clampInt(input.timeoutMs, 100, 300_000, DEFAULT_LOAD_TEST_CONFIG.timeoutMs),
    delayMs: clampInt(input.delayMs, 0, 60_000, DEFAULT_LOAD_TEST_CONFIG.delayMs),
    keepAlive: input.keepAlive !== false
  };
}

/**
 * Clamps an integer configuration value into a safe range.
 *
 * @param value - Raw numeric input.
 * @param min - Minimum allowed value.
 * @param max - Maximum allowed value.
 * @param fallback - Value used when input is invalid.
 */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

/**
 * Subscribes to default-config changes for useSyncExternalStore.
 *
 * @param listener - Callback invoked when store state changes.
 */
export function subscribeStore(listener: () => void): () => void {
  return defaultConfigStore.subscribe(listener);
}

/**
 * Returns the current default load test configuration snapshot.
 */
export function getDefaultConfigSnapshot(): LoadTestConfig {
  return defaultConfigStore.getSnapshot();
}

/**
 * Updates the default load test configuration for the current session.
 *
 * @param config - Configuration to save as the new default.
 */
export function saveDefaultConfig(config: LoadTestConfig): void {
  defaultConfigStore.setState(normalizeConfig(config));
}

/**
 * React hook for the default load test configuration.
 */
export function useDefaultConfig(): LoadTestConfig {
  return useSyncExternalStore(
    defaultConfigStore.subscribe,
    defaultConfigStore.getSnapshot,
    defaultConfigStore.getSnapshot
  );
}

/**
 * Returns the latest aggregate result for one request key.
 *
 * @param key - Request key from {@link RequestTabContext.requestKey}.
 */
export function getResult(key: string): LoadAggregate | undefined {
  return requireResultsStore().getSnapshot()[key];
}

/**
 * Returns live progress for one request key.
 *
 * @param key - Request key from {@link RequestTabContext.requestKey}.
 */
export function getProgress(key: string): LoadProgress | undefined {
  return requireProgressStore().getSnapshot()[key];
}

/**
 * Stores an aggregate result for one request key.
 *
 * @param key - Request key from {@link RequestTabContext.requestKey}.
 * @param aggregate - Completed load test aggregate.
 */
export function setResult(key: string, aggregate: LoadAggregate): void {
  const results = requireResultsStore();
  const progress = requireProgressStore();
  void results.set({ ...results.getSnapshot(), [key]: aggregate });
  void progress.set({
    ...progress.getSnapshot(),
    [key]: {
      completed: aggregate.samples.length,
      total: aggregate.total,
      running: false
    }
  });
}

/**
 * Updates live progress for one request key.
 *
 * @param key - Request key from {@link RequestTabContext.requestKey}.
 * @param progressValue - Current progress snapshot.
 */
export function setProgress(key: string, progressValue: LoadProgress): void {
  const progress = requireProgressStore();
  void progress.set({ ...progress.getSnapshot(), [key]: progressValue });
}

/**
 * Starts a fresh abort controller for a new run.
 *
 * @param key - Request key from {@link RequestTabContext.requestKey}.
 */
export function beginRun(key: string): AbortController {
  abortControllers.get(key)?.abort();
  const controller = new AbortController();
  abortControllers.set(key, controller);
  return controller;
}

/**
 * Clears the abort controller after a run finishes.
 *
 * @param key - Request key from {@link RequestTabContext.requestKey}.
 */
export function clearAbortController(key: string): void {
  abortControllers.delete(key);
}

/**
 * Aborts an active run for one request key.
 *
 * @param key - Request key from {@link RequestTabContext.requestKey}.
 */
export function abortRun(key: string): void {
  abortControllers.get(key)?.abort();
}

/**
 * React hook for one request key's latest aggregate result.
 *
 * @param key - Request key from {@link RequestTabContext.requestKey}.
 */
export function useLoadResult(key: string): LoadAggregate | undefined {
  const store = requireResultsStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot()[key],
    () => store.getSnapshot()[key]
  );
}

/**
 * React hook for one request key's live progress.
 *
 * @param key - Request key from {@link RequestTabContext.requestKey}.
 */
export function useLoadProgress(key: string): LoadProgress | undefined {
  const store = requireProgressStore();
  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot()[key],
    () => store.getSnapshot()[key]
  );
}
