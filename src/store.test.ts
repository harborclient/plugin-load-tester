import { describe, expect, it } from 'vitest';
import type { LoadAggregate, LoadProgress } from './types';
import {
  applyProgressRecord,
  applyResultsRecord,
  getProgress,
  getResult,
  hydrateProgressRecord,
  hydrateResultsRecord,
  serializeProgressRecord,
  serializeResultsRecord
} from './store';

const sampleAggregate: LoadAggregate = {
  startedAt: 1000,
  finishedAt: 2000,
  total: 2,
  success: 2,
  errors: 0,
  durationMs: 1000,
  throughput: 2,
  latency: {
    min: 10,
    max: 20,
    avg: 15,
    p50: 15,
    p90: 19,
    p95: 19.5,
    p99: 19.9
  },
  statusCodes: { '200': 2 },
  samples: [{ at: 1500, durationMs: 15, status: 200, error: null }]
};

const sampleProgress: LoadProgress = {
  completed: 1,
  total: 10,
  running: true
};

const requestKey = 'GET https://example.com';

describe('serializeResultsRecord', () => {
  it('converts a results map to a plain record', () => {
    const map = new Map<string, LoadAggregate>([[requestKey, sampleAggregate]]);
    expect(serializeResultsRecord(map)).toEqual({
      [requestKey]: sampleAggregate
    });
  });
});

describe('serializeProgressRecord', () => {
  it('converts a progress map to a plain record', () => {
    const map = new Map<string, LoadProgress>([[requestKey, sampleProgress]]);
    expect(serializeProgressRecord(map)).toEqual({
      [requestKey]: sampleProgress
    });
  });
});

describe('hydrateResultsRecord', () => {
  it('accepts valid stored aggregates and ignores invalid entries', () => {
    const hydrated = hydrateResultsRecord({
      [requestKey]: sampleAggregate,
      invalid: { total: 'nope' }
    });
    expect(hydrated).toEqual({
      [requestKey]: sampleAggregate
    });
  });

  it('returns an empty record for non-object storage values', () => {
    expect(hydrateResultsRecord(null)).toEqual({});
    expect(hydrateResultsRecord([])).toEqual({});
  });
});

describe('hydrateProgressRecord', () => {
  it('accepts valid stored progress and ignores invalid entries', () => {
    const hydrated = hydrateProgressRecord({
      [requestKey]: sampleProgress,
      invalid: { running: 'yes' }
    });
    expect(hydrated).toEqual({
      [requestKey]: sampleProgress
    });
  });
});

describe('applyResultsRecord', () => {
  it('replaces the in-memory results map from a hydrated record', () => {
    applyResultsRecord({});
    expect(getResult(requestKey)).toBeUndefined();

    applyResultsRecord({ [requestKey]: sampleAggregate });
    expect(getResult(requestKey)).toEqual(sampleAggregate);
  });
});

describe('applyProgressRecord', () => {
  it('replaces the in-memory progress map from a hydrated record', () => {
    applyProgressRecord({});
    expect(getProgress(requestKey)).toBeUndefined();

    applyProgressRecord({ [requestKey]: sampleProgress });
    expect(getProgress(requestKey)).toEqual(sampleProgress);
  });
});

describe('storage round trip', () => {
  it('preserves aggregate and progress data through serialize and hydrate', () => {
    const resultsMap = new Map<string, LoadAggregate>([[requestKey, sampleAggregate]]);
    const progressMap = new Map<string, LoadProgress>([[requestKey, sampleProgress]]);

    const resultsRoundTrip = hydrateResultsRecord(serializeResultsRecord(resultsMap));
    const progressRoundTrip = hydrateProgressRecord(serializeProgressRecord(progressMap));

    expect(resultsRoundTrip).toEqual(Object.fromEntries(resultsMap));
    expect(progressRoundTrip).toEqual(Object.fromEntries(progressMap));
  });
});
