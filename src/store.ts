import { useSyncExternalStore } from '@harborclient/sdk/react';
import type { PluginContext } from '@harborclient/sdk';
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

let hc: PluginContext | null = null;
let defaultConfig: LoadTestConfig = { ...DEFAULT_LOAD_TEST_CONFIG };
/** Cached snapshot for useSyncExternalStore — must keep referential equality between updates. */
let defaultConfigSnapshot: LoadTestConfig = { ...defaultConfig };
const resultsByKey = new Map<string, LoadAggregate>();
const progressByKey = new Map<string, LoadProgress>();
const abortControllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();
/** Last serialized results snapshot used to skip no-op storage reloads. */
let lastResultsJson = '{}';
/** Last serialized progress snapshot used to skip no-op storage reloads. */
let lastProgressJson = '{}';

/**
 * Notifies all store subscribers of a state change.
 */
function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Refreshes the cached default-config snapshot after in-memory updates.
 */
function refreshDefaultConfigSnapshot(): void {
  defaultConfigSnapshot = { ...defaultConfig };
}

/**
 * Serializes the in-memory results map for plugin storage.
 *
 * @param source - Current results keyed by request key.
 */
export function serializeResultsRecord(
  source: Map<string, LoadAggregate>
): Record<string, LoadAggregate> {
  return Object.fromEntries(source.entries());
}

/**
 * Serializes the in-memory progress map for plugin storage.
 *
 * @param source - Current progress keyed by request key.
 */
export function serializeProgressRecord(
  source: Map<string, LoadProgress>
): Record<string, LoadProgress> {
  return Object.fromEntries(source.entries());
}

/**
 * Replaces the in-memory results map from a persisted record.
 *
 * @param record - Stored results keyed by request key.
 */
export function applyResultsRecord(record: Record<string, LoadAggregate>): void {
  resultsByKey.clear();
  for (const [key, aggregate] of Object.entries(record)) {
    if (isLoadAggregate(aggregate)) {
      resultsByKey.set(key, aggregate);
    }
  }
}

/**
 * Replaces the in-memory progress map from a persisted record.
 *
 * @param record - Stored progress keyed by request key.
 */
export function applyProgressRecord(record: Record<string, LoadProgress>): void {
  progressByKey.clear();
  for (const [key, progress] of Object.entries(record)) {
    if (isLoadProgress(progress)) {
      progressByKey.set(key, progress);
    }
  }
}

/**
 * Returns true when a value matches the {@link LoadAggregate} shape.
 *
 * @param value - Candidate value from storage.
 */
function isLoadAggregate(value: unknown): value is LoadAggregate {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as LoadAggregate;
  return (
    typeof candidate.startedAt === 'number' &&
    typeof candidate.finishedAt === 'number' &&
    typeof candidate.total === 'number' &&
    Array.isArray(candidate.samples)
  );
}

/**
 * Returns true when a value matches the {@link LoadProgress} shape.
 *
 * @param value - Candidate value from storage.
 */
function isLoadProgress(value: unknown): value is LoadProgress {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as LoadProgress;
  return (
    typeof candidate.completed === 'number' &&
    typeof candidate.total === 'number' &&
    typeof candidate.running === 'boolean'
  );
}

/**
 * Normalizes a stored record into a string-keyed map of aggregates.
 *
 * @param stored - Raw value from plugin storage.
 */
export function hydrateResultsRecord(stored: unknown): Record<string, LoadAggregate> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return {};
  }
  const record: Record<string, LoadAggregate> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (isLoadAggregate(value)) {
      record[key] = value;
    }
  }
  return record;
}

/**
 * Normalizes a stored record into a string-keyed map of progress snapshots.
 *
 * @param stored - Raw value from plugin storage.
 */
export function hydrateProgressRecord(stored: unknown): Record<string, LoadProgress> {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return {};
  }
  const record: Record<string, LoadProgress> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (isLoadProgress(value)) {
      record[key] = value;
    }
  }
  return record;
}

/**
 * Updates the serialized storage snapshot caches from the current in-memory maps.
 */
function refreshStorageSnapshotCaches(): void {
  lastResultsJson = JSON.stringify(serializeResultsRecord(resultsByKey));
  lastProgressJson = JSON.stringify(serializeProgressRecord(progressByKey));
}

/**
 * Applies hydrated storage records only when their serialized form changed.
 *
 * @param storedResults - Raw results value from plugin storage.
 * @param storedProgress - Raw progress value from plugin storage.
 * @returns Whether in-memory state was updated.
 */
function syncFromStored(storedResults: unknown, storedProgress: unknown): boolean {
  const resultsRecord = hydrateResultsRecord(storedResults);
  const progressRecord = hydrateProgressRecord(storedProgress);
  const resultsJson = JSON.stringify(resultsRecord);
  const progressJson = JSON.stringify(progressRecord);

  let changed = false;
  if (resultsJson !== lastResultsJson) {
    applyResultsRecord(resultsRecord);
    lastResultsJson = resultsJson;
    changed = true;
  }
  if (progressJson !== lastProgressJson) {
    applyProgressRecord(progressRecord);
    lastProgressJson = progressJson;
    changed = true;
  }
  return changed;
}

/**
 * Persists the current results and progress snapshots to plugin storage.
 */
async function persistSnapshots(): Promise<void> {
  if (!hc) {
    return;
  }
  await Promise.all([
    hc.storage.set(RESULTS_STORAGE_KEY, serializeResultsRecord(resultsByKey)),
    hc.storage.set(PROGRESS_STORAGE_KEY, serializeProgressRecord(progressByKey))
  ]);
}

/**
 * Initializes the store with the plugin context and hydrates from storage.
 *
 * @param context - Renderer plugin context from HarborClient.
 */
export async function initStore(context: PluginContext): Promise<void> {
  hc = context;
  refreshDefaultConfigSnapshot();

  const [storedResults, storedProgress] = await Promise.all([
    hc.storage.get<Record<string, LoadAggregate>>(RESULTS_STORAGE_KEY),
    hc.storage.get<Record<string, LoadProgress>>(PROGRESS_STORAGE_KEY)
  ]);
  syncFromStored(storedResults, storedProgress);
  notify();
}

/**
 * Reloads load test results and progress from persisted plugin storage.
 *
 * Separate plugin webviews do not share in-memory state; call this after another
 * surface writes storage (for example when the request tab completes a run).
 */
export async function reloadFromStorage(): Promise<void> {
  if (!hc) {
    return;
  }
  const [storedResults, storedProgress] = await Promise.all([
    hc.storage.get<Record<string, LoadAggregate>>(RESULTS_STORAGE_KEY),
    hc.storage.get<Record<string, LoadProgress>>(PROGRESS_STORAGE_KEY)
  ]);
  if (syncFromStored(storedResults, storedProgress)) {
    notify();
  }
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
 * Subscribes to store changes for useSyncExternalStore.
 *
 * @param listener - Callback invoked when store state changes.
 */
export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns the current default load test configuration snapshot.
 */
export function getDefaultConfigSnapshot(): LoadTestConfig {
  return defaultConfigSnapshot;
}

/**
 * Updates the default load test configuration for the current session.
 *
 * @param config - Configuration to save as the new default.
 */
export function saveDefaultConfig(config: LoadTestConfig): void {
  defaultConfig = normalizeConfig(config);
  refreshDefaultConfigSnapshot();
  notify();
}

/**
 * React hook for the default load test configuration.
 */
export function useDefaultConfig(): LoadTestConfig {
  return useSyncExternalStore(subscribeStore, getDefaultConfigSnapshot, getDefaultConfigSnapshot);
}

/**
 * Returns the latest aggregate result for one request key.
 *
 * @param key - Request key from {@link requestKey}.
 */
export function getResult(key: string): LoadAggregate | undefined {
  return resultsByKey.get(key);
}

/**
 * Returns live progress for one request key.
 *
 * @param key - Request key from {@link requestKey}.
 */
export function getProgress(key: string): LoadProgress | undefined {
  return progressByKey.get(key);
}

/**
 * Stores an aggregate result for one request key.
 *
 * @param key - Request key from {@link requestKey}.
 * @param aggregate - Completed load test aggregate.
 */
export function setResult(key: string, aggregate: LoadAggregate): void {
  resultsByKey.set(key, aggregate);
  progressByKey.set(key, {
    completed: aggregate.samples.length,
    total: aggregate.total,
    running: false
  });
  refreshStorageSnapshotCaches();
  notify();
  void persistSnapshots();
}

/**
 * Updates live progress for one request key.
 *
 * @param key - Request key from {@link requestKey}.
 * @param progress - Current progress snapshot.
 */
export function setProgress(key: string, progress: LoadProgress): void {
  progressByKey.set(key, progress);
  refreshStorageSnapshotCaches();
  notify();
  void persistSnapshots();
}

/**
 * Starts a fresh abort controller for a new run.
 *
 * @param key - Request key from {@link requestKey}.
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
 * @param key - Request key from {@link requestKey}.
 */
export function clearAbortController(key: string): void {
  abortControllers.delete(key);
}

/**
 * Aborts an active run for one request key.
 *
 * @param key - Request key from {@link requestKey}.
 */
export function abortRun(key: string): void {
  abortControllers.get(key)?.abort();
}

/**
 * React hook for one request key's latest aggregate result.
 *
 * @param key - Request key from {@link requestKey}.
 */
export function useLoadResult(key: string): LoadAggregate | undefined {
  return useSyncExternalStore(
    subscribeStore,
    () => getResult(key),
    () => getResult(key)
  );
}

/**
 * React hook for one request key's live progress.
 *
 * @param key - Request key from {@link requestKey}.
 */
export function useLoadProgress(key: string): LoadProgress | undefined {
  return useSyncExternalStore(
    subscribeStore,
    () => getProgress(key),
    () => getProgress(key)
  );
}
