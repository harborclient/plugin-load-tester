import { useId, useMemo, useState } from '@harborclient/sdk/react';
import type { PluginContext } from '@harborclient/sdk';
import { Button, EmptyState } from '@harborclient/sdk/components';
import type { LoadAggregate } from './types';
import { BarChart } from './charts/BarChart';
import { DoughnutChart } from './charts/DoughnutChart';
import { LineChart } from './charts/LineChart';
import {
  defaultExportPath,
  saveDialogFilters,
  serializeLoadTestCsv,
  serializeLoadTestJson,
  type LoadTestExportFormat
} from './exportLoadTest';

/** Inline stat grid — plugin Tailwind responsive classes are not scanned by the host app. */
const STAT_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '12px'
} as const;

interface Props {
  /** Aggregate results to render; when absent an empty state is shown. */
  result?: LoadAggregate;
  /** Optional title shown above the summary cards. */
  title?: string;
  /** Plugin context for export; when omitted the export toolbar is hidden. */
  hc?: PluginContext;
}

/**
 * Renders load test summary statistics and Chart.js visualizations.
 */
export function LoadResultsView({ result, title, hc }: Props) {
  const formatSelectId = useId();
  const [format, setFormat] = useState<LoadTestExportFormat>('json');
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const lineLabels = useMemo(
    () => result?.samples.map((_, index) => String(index + 1)) ?? [],
    [result?.samples]
  );
  const lineValues = useMemo(
    () => result?.samples.map((sample) => sample.durationMs) ?? [],
    [result?.samples]
  );
  const latencyLabels = useMemo(() => ['Min', 'Avg', 'p50', 'p90', 'p95', 'p99', 'Max'], []);
  const latencyValues = useMemo(() => {
    if (!result) {
      return [];
    }
    return [
      result.latency.min,
      result.latency.avg,
      result.latency.p50,
      result.latency.p90,
      result.latency.p95,
      result.latency.p99,
      result.latency.max
    ];
  }, [result]);
  const statusLabels = useMemo(() => Object.keys(result?.statusCodes ?? {}), [result?.statusCodes]);
  const statusValues = useMemo(
    () => statusLabels.map((label) => result?.statusCodes[label] ?? 0),
    [result?.statusCodes, statusLabels]
  );

  const showExport = hc != null && (result?.samples.length ?? 0) > 0;

  /**
   * Serializes the current results and opens the native save dialog.
   */
  const handleExport = async (): Promise<void> => {
    if (!hc || !result) {
      return;
    }

    setExportError(null);
    setExporting(true);

    try {
      const content =
        format === 'json' ? serializeLoadTestJson(result) : serializeLoadTestCsv(result);
      const savedPath = await hc.fs.saveFile(content, {
        defaultPath: defaultExportPath(format, result.startedAt),
        filters: saveDialogFilters(format)
      });

      if (savedPath != null) {
        hc.ui.showToast('Load test results exported');
      }
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };

  if (!result || result.samples.length === 0) {
    return (
      <EmptyState variant="centered">
        Run a load test to see latency percentiles, throughput, and status distribution here.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {title ? <h3 className="text-[16px] font-semibold">{title}</h3> : null}

      {showExport ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={formatSelectId} className="text-[14px] text-muted">
                Format
              </label>
              <select
                id={formatSelectId}
                className="rounded-md border border-separator bg-control px-2 py-1.5 text-[14px] text-text"
                value={format}
                onChange={(event) => {
                  setFormat(event.target.value as LoadTestExportFormat);
                }}
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={exporting}
              onClick={() => {
                void handleExport();
              }}
            >
              Export
            </Button>
          </div>
          {exportError ? (
            <p className="text-[14px] text-danger" role="alert">
              {exportError}
            </p>
          ) : null}
        </div>
      ) : null}

      <div style={STAT_GRID_STYLE}>
        <StatCard label="Total requests" value={String(result.total)} />
        <StatCard label="Successful" value={String(result.success)} />
        <StatCard label="Errors" value={String(result.errors)} />
        <StatCard label="Throughput" value={`${result.throughput.toFixed(2)} req/s`} />
        <StatCard label="Run duration" value={`${result.durationMs.toFixed(0)} ms`} />
        <StatCard label="Avg latency" value={`${result.latency.avg.toFixed(1)} ms`} />
        <StatCard label="p95 latency" value={`${result.latency.p95.toFixed(1)} ms`} />
        <StatCard label="Max latency" value={`${result.latency.max.toFixed(1)} ms`} />
      </div>

      <section className="flex flex-col gap-2">
        <h4 className="text-[14px] font-medium">Latency over time</h4>
        <LineChart labels={lineLabels} values={lineValues} />
      </section>

      <section className="flex flex-col gap-2">
        <h4 className="text-[14px] font-medium">Latency percentiles</h4>
        <BarChart labels={latencyLabels} values={latencyValues} />
      </section>

      {statusLabels.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-[14px] font-medium">Status distribution</h4>
          <DoughnutChart labels={statusLabels} values={statusValues} />
        </section>
      ) : null}
    </div>
  );
}

interface StatCardProps {
  /** Metric label. */
  label: string;
  /** Metric value. */
  value: string;
}

/**
 * Compact metric card for load test summary values.
 */
function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-md border border-separator bg-control px-3 py-2">
      <div className="text-[14px] text-muted">{label}</div>
      <div className="text-[16px] font-medium">{value}</div>
    </div>
  );
}
