import { useState } from '@harborclient/sdk/react';
import type { PluginContext, RequestTabContext } from '@harborclient/sdk';
import { Spinner, StatusMessage } from '@harborclient/sdk/components';
import { logLoadTestRequest } from './consoleLog';
import { LoadTestForm } from './LoadTestForm';
import { runLoadTest } from './loadEngine';
import { createHostSender } from './sendViaHost';
import { requestKey } from './requestKey';
import { resolveFromContext } from './resolve';
import {
  abortRun,
  beginRun,
  clearAbortController,
  setProgress,
  setResult,
  useLoadProgress
} from './store';
import type { LoadTestConfig } from './types';

interface Props {
  /** Active request tab context from HarborClient. */
  context: RequestTabContext;
  /** Plugin context used for footer console logging. */
  hc: PluginContext;
}

/**
 * Request editor tab for configuring and running a single-request load test.
 */
export function LoadTesterTab({ context, hc }: Props) {
  const key = requestKey(context.draft);
  const progress = useLoadProgress(key);
  const [error, setError] = useState<string | null>(null);

  const running = progress?.running ?? false;

  /**
   * Starts a load test for the active request draft.
   *
   * @param config - User-selected load test configuration.
   */
  const handleRun = async (config: LoadTestConfig): Promise<void> => {
    setError(null);
    const target = resolveFromContext(context);
    if (!target.url.trim()) {
      setError('Enter a request URL before running a load test.');
      return;
    }

    const nextController = beginRun(key);
    void hc.host.clearResponse();
    setProgress(key, { completed: 0, total: config.count, running: true });

    try {
      const aggregate = await runLoadTest([target], config, {
        signal: nextController.signal,
        send: createHostSender(hc),
        onProgress: (completed, total) => {
          setProgress(key, { completed, total, running: true });
        },
        onRequestComplete: ({ target: completedTarget, sample, result }) => {
          logLoadTestRequest(hc, {
            requestName: sample.requestName ?? completedTarget.name,
            result
          });
        }
      });
      setResult(key, aggregate);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
      setProgress(key, { completed: 0, total: config.count, running: false });
    } finally {
      clearAbortController(key);
    }
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <div>
        <h3 className="text-[16px] font-semibold">Load Tester</h3>
        <p className="mt-1 text-[14px] text-muted">
          Fire repeated requests against the current endpoint and inspect latency percentiles,
          throughput, and error rate in the Load Testing response tab.
        </p>
      </div>

      {error ? (
        <StatusMessage live className="text-danger">
          {error}
        </StatusMessage>
      ) : null}

      {running ? (
        <Spinner
          label={`Running load test (${progress?.completed ?? 0}/${progress?.total ?? 0})`}
        />
      ) : null}

      <LoadTestForm
        running={running}
        onRun={(config) => {
          void handleRun(config);
        }}
        onCancel={() => {
          abortRun(key);
        }}
      />
    </div>
  );
}
