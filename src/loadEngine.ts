import type { BodyType } from '@harborclient/sdk';
import type { LoadAggregate, LoadSample, LoadTarget, LoadTestConfig } from './types';

/**
 * Send-result shape compatible with HarborClient footer console entries.
 */
export interface HostSendResult {
  /** HTTP status code, or 0 when the request failed before a response. */
  status: number;
  /** HTTP status text from the response. */
  statusText: string;
  /** Response headers as a flat key-value map. */
  headers: Record<string, string>;
  /** Response body as text. */
  body: string;
  /** Round-trip time in milliseconds. */
  timeMs: number;
  /** Response body size in bytes. */
  sizeBytes: number;
  /** Error message when the request failed; omitted on success. */
  error?: string;
  /** Outgoing request metadata for console inspector details. */
  request?: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string;
    bodyType?: BodyType;
  };
}

/**
 * Options passed to {@link runLoadTest} for progress and cancellation.
 */
export interface RunLoadTestCallbacks {
  /** Called after each request completes. */
  onProgress?: (completed: number, total: number) => void;
  /** Called when an individual sample is recorded. */
  onSample?: (sample: LoadSample) => void;
  /** Called with full request/response metadata for footer console logging. */
  onRequestComplete?: (info: {
    target: LoadTarget;
    sample: LoadSample;
    result: HostSendResult;
  }) => void;
  /** Performs each request; routes through the host main process to avoid CORS. */
  send?: LoadSender;
  /** When aborted, in-flight requests stop and the aggregate is returned. */
  signal?: AbortSignal;
}

/**
 * Sends one resolved target and returns its result. Implementations route
 * through the host main process to bypass renderer CORS restrictions.
 */
export type LoadSender = (
  target: LoadTarget,
  options: LoadTestConfig,
  signal: AbortSignal
) => Promise<HostSendResult>;

/**
 * Computes a percentile from a sorted numeric array.
 *
 * @param sorted - Ascending latency values.
 * @param p - Percentile between 0 and 100.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0] ?? 0;
  }

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  const lowerValue = sorted[lower] ?? 0;
  const upperValue = sorted[upper] ?? lowerValue;
  return lowerValue + (upperValue - lowerValue) * weight;
}

/**
 * Aggregates raw samples into summary statistics for charts and tables.
 *
 * @param samples - Completed load test samples.
 * @param startedAt - Run start timestamp.
 * @param finishedAt - Run finish timestamp.
 * @param total - Configured request count.
 */
export function aggregate(
  samples: LoadSample[],
  startedAt: number,
  finishedAt: number,
  total: number
): LoadAggregate {
  const durationMs = Math.max(0, finishedAt - startedAt);
  const successfulSamples = samples.filter(
    (sample) => sample.error == null && sample.status != null
  );
  const latencies = successfulSamples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const statusCodes: Record<string, number> = {};

  for (const sample of samples) {
    const key = sample.error ? 'error' : String(sample.status ?? 'unknown');
    statusCodes[key] = (statusCodes[key] ?? 0) + 1;
  }

  const success = successfulSamples.length;
  const errors = samples.length - success;
  const avg =
    latencies.length > 0 ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;

  return {
    startedAt,
    finishedAt,
    total,
    success,
    errors,
    durationMs,
    throughput: durationMs > 0 ? (samples.length / durationMs) * 1000 : 0,
    latency: {
      min: latencies[0] ?? 0,
      max: latencies[latencies.length - 1] ?? 0,
      avg,
      p50: percentile(latencies, 50),
      p90: percentile(latencies, 90),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99)
    },
    statusCodes,
    samples
  };
}

/**
 * Waits for the configured delay unless the run is aborted.
 *
 * @param delayMs - Delay before starting the next request.
 * @param signal - Abort signal for the run.
 */
async function waitDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0 || signal.aborted) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      resolve();
    }, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new DOMException('Load test aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

/**
 * Builds a failed result placeholder used when a request cannot complete.
 *
 * @param message - Error message describing the failure.
 */
function errorResult(message: string): HostSendResult {
  return {
    status: 0,
    statusText: 'Error',
    headers: {},
    body: '',
    timeMs: 0,
    sizeBytes: 0,
    error: message
  };
}

/**
 * Executes one HTTP request through the injected sender and records timing.
 *
 * The sender routes through the host main process, so requests are not subject
 * to renderer CORS restrictions.
 *
 * @param target - Resolved HTTP target.
 * @param options - Load test configuration.
 * @param signal - Abort signal for the run.
 * @param send - Sender performing the request via the host main process.
 */
async function executeRequest(
  target: LoadTarget,
  options: LoadTestConfig,
  signal: AbortSignal,
  send: LoadSender
): Promise<{ sample: LoadSample; result: HostSendResult }> {
  let result: HostSendResult;
  try {
    await waitDelay(options.delayMs, signal);
    result = await send(target, options, signal);
    if (!result || typeof result !== 'object' || typeof result.timeMs !== 'number') {
      result = errorResult('Host did not return a send result.');
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === 'AbortError'
          ? 'Request timed out or was aborted'
          : error.message
        : String(error);
    result = errorResult(message);
  }

  const sample: LoadSample = {
    at: Date.now(),
    durationMs: result.timeMs,
    status: result.error ? null : result.status,
    error: result.error ?? null,
    requestName: target.name
  };

  return { sample, result };
}

/**
 * Runs a bounded worker pool until the configured request count is reached.
 *
 * @param total - Total requests to execute.
 * @param concurrency - Maximum in-flight requests.
 * @param worker - Callback invoked once per request slot.
 */
export async function runPool(
  total: number,
  concurrency: number,
  worker: (index: number) => Promise<void>
): Promise<void> {
  if (total <= 0) {
    return;
  }

  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, total));

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) {
        return;
      }
      await worker(index);
    }
  });

  await Promise.all(workers);
}

/**
 * Executes a load test against one or more HTTP targets.
 *
 * @param targets - Round-robin targets for each request slot.
 * @param options - Load test configuration.
 * @param callbacks - Optional progress and cancellation hooks.
 */
export async function runLoadTest(
  targets: LoadTarget[],
  options: LoadTestConfig,
  callbacks: RunLoadTestCallbacks = {}
): Promise<LoadAggregate> {
  if (targets.length === 0) {
    throw new Error('At least one request target is required.');
  }

  const send = callbacks.send;
  if (!send) {
    throw new Error('runLoadTest requires a send implementation.');
  }

  const total = Math.max(1, Math.floor(options.count));
  const concurrency = Math.max(1, Math.floor(options.concurrency));
  const samples: LoadSample[] = [];
  const startedAt = Date.now();
  const signal = callbacks.signal ?? new AbortController().signal;

  await runPool(total, concurrency, async (index) => {
    if (signal.aborted) {
      return;
    }
    const target = targets[index % targets.length] as LoadTarget;
    const { sample, result } = await executeRequest(target, options, signal, send);
    samples.push(sample);
    callbacks.onSample?.(sample);
    callbacks.onRequestComplete?.({ target, sample, result });
    callbacks.onProgress?.(samples.length, total);
  });

  return aggregate(samples, startedAt, Date.now(), total);
}
