import { useEffect } from '@harborclient/sdk/react';
import { syncOnWindowFocus } from '@harborclient/sdk/store';
import type { PluginContext, ResponseTabContext } from '@harborclient/sdk';
import { LoadResultsView } from './LoadResultsView';
import { getProgressStore, getResultsStore, useLoadProgress, useLoadResult } from './store';

interface Props {
  /** Active response tab context from HarborClient. */
  context: ResponseTabContext;
  /** Plugin context used for exporting results. */
  hc: PluginContext;
}

/**
 * Response viewer tab that shows load test charts for the active request.
 */
export function ResponseLoadTab({ context, hc }: Props) {
  const key = context.requestKey;
  const result = useLoadResult(key);
  const progress = useLoadProgress(key);

  /**
   * Reloads persisted results from other plugin webviews on mount, when the
   * request key changes, on focus/visibility, and on a short interval so
   * progress updates while this tab stays selected during a run.
   */
  useEffect(() => {
    const syncDisposable = syncOnWindowFocus([getResultsStore(), getProgressStore()], {
      intervalMs: 500
    });
    return () => {
      syncDisposable.dispose();
    };
  }, [key]);

  return (
    <div className="h-full overflow-y-auto p-4">
      {progress?.running ? (
        <p className="mb-4 text-[14px] text-muted" role="status" aria-live="polite">
          Load test running: {progress.completed}/{progress.total} requests completed.
        </p>
      ) : null}
      <LoadResultsView result={result} hc={hc} />
    </div>
  );
}
