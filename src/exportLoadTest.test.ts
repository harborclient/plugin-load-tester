import { describe, expect, it } from 'vitest';
import {
  defaultExportPath,
  saveDialogFilters,
  serializeLoadTestCsv,
  serializeLoadTestJson
} from './exportLoadTest';
import type { LoadAggregate } from './types';

/**
 * Builds a minimal aggregate fixture for export tests.
 */
function sampleAggregate(): LoadAggregate {
  return {
    startedAt: 1_719_571_200_000,
    finishedAt: 1_719_571_205_000,
    total: 2,
    success: 1,
    errors: 1,
    durationMs: 5000,
    throughput: 0.4,
    latency: {
      min: 10,
      max: 20,
      avg: 15,
      p50: 15,
      p90: 19,
      p95: 19.5,
      p99: 19.9
    },
    statusCodes: { '200': 1, error: 1 },
    samples: [
      {
        at: 1_719_571_200_100,
        durationMs: 10,
        status: 200,
        error: null,
        requestName: 'GET /api'
      },
      {
        at: 1_719_571_200_200,
        durationMs: 20,
        status: null,
        error: 'timeout, "retry"',
        requestName: 'POST /items, bulk'
      }
    ]
  };
}

describe('serializeLoadTestJson', () => {
  it('wraps aggregate data in a versioned envelope', () => {
    const parsed = JSON.parse(serializeLoadTestJson(sampleAggregate())) as {
      format: string;
      version: number;
      summary: { total: number; latency: { p95: number } };
      samples: unknown[];
    };

    expect(parsed.format).toBe('harborclient.load-test');
    expect(parsed.version).toBe(1);
    expect(parsed.summary.total).toBe(2);
    expect(parsed.summary.latency.p95).toBe(19.5);
    expect(parsed.samples).toHaveLength(2);
  });
});

describe('serializeLoadTestCsv', () => {
  it('includes a header and one row per sample', () => {
    const csv = serializeLoadTestCsv(sampleAggregate());
    const lines = csv.split('\n');

    expect(lines[0]).toBe('index,timestamp_ms,duration_ms,status,error,request_name');
    expect(lines).toHaveLength(3);
  });

  it('escapes commas and quotes in sample fields', () => {
    const csv = serializeLoadTestCsv(sampleAggregate());
    const lines = csv.split('\n');

    expect(lines[2]).toContain('"timeout, ""retry"""');
    expect(lines[2]).toContain('"POST /items, bulk"');
  });
});

describe('defaultExportPath', () => {
  it('uses the run start time and selected extension', () => {
    expect(defaultExportPath('json', 1_719_571_200_000)).toMatch(/^load-test-\d{8}-\d{6}\.json$/);
    expect(defaultExportPath('csv', 1_719_571_200_000)).toMatch(/^load-test-\d{8}-\d{6}\.csv$/);
  });
});

describe('saveDialogFilters', () => {
  it('returns format-specific file filters', () => {
    expect(saveDialogFilters('json')).toEqual([{ name: 'JSON', extensions: ['json'] }]);
    expect(saveDialogFilters('csv')).toEqual([{ name: 'CSV', extensions: ['csv'] }]);
  });
});
