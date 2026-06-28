import { useSyncExternalStore } from '@harborclient/sdk/react';
import type { LoadAggregate, LoadProgress, LoadTestConfig } from './types';

/** Default load test configuration for new runs. */
export const DEFAULT_LOAD_TEST_CONFIG: LoadTestConfig = {
  count: 10,
  concurrency: 1,
  timeoutMs: 30_000,
  delayMs: 0,
  keepAlive: true
};

let defaultConfig: LoadTestConfig = { ...DEFAULT_LOAD_TEST_CONFIG };
/** Cached snapshot for useSyncExternalStore — must keep referential equality between updates. */
let defaultConfigSnapshot: LoadTestConfig = { ...defaultConfig };
const resultsByKey = new Map<string, LoadAggregate>();
const progressByKey = new Map<string, LoadProgress>();
const abortControllers = new Map<string, AbortController>();
const listeners = new Set<() => void>();

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
 * Initializes the in-memory results store for the plugin session.
 */
export async function initStore(): Promise<void> {
  refreshDefaultConfigSnapshot();
  notify();
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
  notify();
}

/**
 * Updates live progress for one request key.
 *
 * @param key - Request key from {@link requestKey}.
 * @param progress - Current progress snapshot.
 */
export function setProgress(key: string, progress: LoadProgress): void {
  progressByKey.set(key, progress);
  notify();
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
