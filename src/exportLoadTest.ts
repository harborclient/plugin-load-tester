import type { PluginFsSaveFileOptions } from '@harborclient/sdk';
import type { LoadAggregate } from './types';

/** Supported export formats for load test results. */
export type LoadTestExportFormat = 'json' | 'csv';

const CSV_HEADER = 'index,timestamp_ms,duration_ms,status,error,request_name';

/**
 * Formats an epoch timestamp as a compact local date-time string for filenames.
 *
 * @param startedAt - Run start time in epoch milliseconds.
 * @returns Suffix like `20250628-143022`.
 */
function formatTimestampForFilename(startedAt: number): string {
  const date = new Date(startedAt);
  const pad = (value: number): string => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Builds a suggested default filename for an export.
 *
 * @param format - Selected export format.
 * @param startedAt - Run start time in epoch milliseconds.
 * @returns Filename such as `load-test-20250628-143022.json`.
 */
export function defaultExportPath(format: LoadTestExportFormat, startedAt: number): string {
  const stamp = formatTimestampForFilename(startedAt);
  const extension = format === 'json' ? 'json' : 'csv';
  return `load-test-${stamp}.${extension}`;
}

/**
 * Returns native save-dialog filters for the selected export format.
 *
 * @param format - Selected export format.
 */
export function saveDialogFilters(
  format: LoadTestExportFormat
): NonNullable<PluginFsSaveFileOptions['filters']> {
  if (format === 'json') {
    return [{ name: 'JSON', extensions: ['json'] }];
  }
  return [{ name: 'CSV', extensions: ['csv'] }];
}

/**
 * Escapes one CSV field per RFC 4180.
 *
 * @param value - Raw cell value.
 */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serializes load test results as a versioned JSON document.
 *
 * @param result - Aggregated load test results.
 */
export function serializeLoadTestJson(result: LoadAggregate): string {
  const payload = {
    format: 'harborclient.load-test',
    version: 1,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    summary: {
      total: result.total,
      success: result.success,
      errors: result.errors,
      durationMs: result.durationMs,
      throughput: result.throughput,
      latency: result.latency,
      statusCodes: result.statusCodes
    },
    samples: result.samples
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Serializes load test samples as a CSV spreadsheet with one row per request.
 *
 * @param result - Aggregated load test results.
 */
export function serializeLoadTestCsv(result: LoadAggregate): string {
  const rows = result.samples.map((sample, index) => {
    const fields = [
      String(index + 1),
      String(sample.at),
      String(sample.durationMs),
      sample.status == null ? '' : String(sample.status),
      sample.error ?? '',
      sample.requestName ?? ''
    ];
    return fields.map(escapeCsvField).join(',');
  });
  return [CSV_HEADER, ...rows].join('\n');
}
