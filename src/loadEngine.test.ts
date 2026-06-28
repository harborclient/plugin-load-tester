import { describe, expect, it, vi } from 'vitest';
import { aggregate, percentile, runLoadTest, runPool } from './loadEngine';
import type { LoadSample, LoadTarget } from './types';

describe('percentile', () => {
  it('returns 0 for an empty array', () => {
    expect(percentile([], 50)).toBe(0);
  });

  it('computes common percentiles', () => {
    expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
    expect(percentile([10, 20, 30, 40, 50], 90)).toBe(46);
  });
});

describe('aggregate', () => {
  it('summarizes samples with throughput and status counts', () => {
    const samples: LoadSample[] = [
      { at: 1, durationMs: 100, status: 200, error: null },
      { at: 2, durationMs: 200, status: 500, error: null },
      { at: 3, durationMs: 0, status: null, error: 'network' }
    ];

    const result = aggregate(samples, 0, 1000, 3);
    expect(result.success).toBe(2);
    expect(result.errors).toBe(1);
    expect(result.statusCodes['200']).toBe(1);
    expect(result.statusCodes.error).toBe(1);
    expect(result.throughput).toBeCloseTo(3);
  });
});

describe('runPool', () => {
  it('executes exactly the configured number of tasks', async () => {
    const seen: number[] = [];
    await runPool(5, 2, async (index) => {
      seen.push(index);
    });
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('runLoadTest', () => {
  it('respects count and concurrency against a mocked sender', async () => {
    const sendMock = vi.fn(async () => ({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain' },
      body: 'ok',
      timeMs: 5,
      sizeBytes: 2
    }));

    const targets: LoadTarget[] = [
      {
        name: 'GET https://example.test',
        method: 'GET',
        url: 'https://example.test',
        headers: {},
        body: ''
      }
    ];

    const result = await runLoadTest(
      targets,
      { count: 4, concurrency: 2, timeoutMs: 5000, delayMs: 0, keepAlive: true },
      { send: sendMock }
    );

    expect(sendMock).toHaveBeenCalledTimes(4);
    expect(result.total).toBe(4);
    expect(result.samples).toHaveLength(4);
    expect(result.success).toBe(4);
  });
});
