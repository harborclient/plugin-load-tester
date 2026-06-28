import type { PluginContext, ResponseTabContext } from '@harborclient/sdk';
import { LoadResultsView } from './LoadResultsView';
import { requestKey } from './requestKey';
import { useLoadProgress, useLoadResult } from './store';

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
  const key = requestKey(context.draft);
  const result = useLoadResult(key);
  const progress = useLoadProgress(key);

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
