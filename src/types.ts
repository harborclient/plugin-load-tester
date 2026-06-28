import type { BodyType } from '@harborclient/sdk';

/**
 * User-configurable load test parameters shared by the request tab and collection modal.
 */
export interface LoadTestConfig {
  /** Total number of HTTP requests to send across all targets. */
  count: number;
  /** Maximum number of in-flight requests at once. */
  concurrency: number;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
  /** Delay in milliseconds before starting each request (simple ramp). */
  delayMs: number;
  /** When true, requests reuse connections when the runtime allows it. */
  keepAlive: boolean;
}

/**
 * One resolved HTTP target the load engine can execute.
 */
export interface LoadTarget {
  /** Display label for charts and summaries. */
  name: string;
  /** HTTP method. */
  method: string;
  /** Fully resolved request URL. */
  url: string;
  /** Outgoing request headers. */
  headers: Record<string, string>;
  /** Request body content when applicable. */
  body: string;
  /** Body encoding used to shape the fetch payload. */
  bodyType?: BodyType;
}

/**
 * One completed load test sample.
 */
export interface LoadSample {
  /** Epoch milliseconds when the sample finished. */
  at: number;
  /** Round-trip latency in milliseconds. */
  durationMs: number;
  /** HTTP status code when a response was received. */
  status: number | null;
  /** Transport or timeout error message. */
  error: string | null;
  /** Target label when running a collection. */
  requestName?: string;
}

/**
 * Latency percentile summary for a load test run.
 */
export interface LoadLatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

/**
 * Aggregated results for one load test run.
 */
export interface LoadAggregate {
  /** When the run started. */
  startedAt: number;
  /** When the run finished. */
  finishedAt: number;
  /** Total configured request count. */
  total: number;
  /** Samples that completed without transport errors. */
  success: number;
  /** Samples that failed due to transport, timeout, or abort. */
  errors: number;
  /** Wall-clock duration of the run in milliseconds. */
  durationMs: number;
  /** Average throughput in requests per second. */
  throughput: number;
  /** Latency statistics over successful samples. */
  latency: LoadLatencyStats;
  /** HTTP status code counts keyed by status string. */
  statusCodes: Record<string, number>;
  /** Raw samples collected during the run. */
  samples: LoadSample[];
}

/**
 * Live progress for an in-flight load test.
 */
export interface LoadProgress {
  /** Completed request count. */
  completed: number;
  /** Total configured request count. */
  total: number;
  /** Whether a run is currently active. */
  running: boolean;
}
