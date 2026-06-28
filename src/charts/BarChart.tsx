import { useEffect, useRef } from '@harborclient/sdk/react';
import { Chart, type ChartConfiguration } from 'chart.js';
import {
  cartesianScaleOptions,
  chartPluginOptions,
  destroyChart,
  ensureChartsRegistered,
  themeColor
} from './chartUtils';
import { ChartFrame } from './ChartFrame';

interface Props {
  /** Percentile labels such as p50 or p99. */
  labels: string[];
  /** Latency values in milliseconds. */
  values: number[];
}

/**
 * Bar chart for latency percentiles from a load test run.
 */
export function BarChart({ labels, values }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'bar'> | null>(null);

  /**
   * Creates or updates the Chart.js bar chart when data changes.
   */
  useEffect(() => {
    ensureChartsRegistered();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    destroyChart(chartRef.current);

    try {
      const accent = themeColor('accent', '#3b82f6');
      const muted = themeColor('muted', '#9ca3af');

      const config: ChartConfiguration<'bar'> = {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Latency (ms)',
              data: values,
              backgroundColor: accent,
              borderRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: chartPluginOptions(),
          scales: {
            x: cartesianScaleOptions(),
            y: {
              ...cartesianScaleOptions(),
              title: {
                display: true,
                text: 'Milliseconds',
                color: muted,
                font: { size: 14 }
              }
            }
          }
        }
      };

      chartRef.current = new Chart(canvas, config);
      requestAnimationFrame(() => {
        chartRef.current?.resize();
      });
    } catch (error) {
      console.error('[load-tester] failed to render bar chart', error);
      destroyChart(chartRef.current);
      chartRef.current = null;
    }

    return () => {
      destroyChart(chartRef.current);
      chartRef.current = null;
    };
  }, [labels, values]);

  return (
    <ChartFrame>
      <canvas ref={canvasRef} aria-label="Latency percentiles chart" role="img" />
    </ChartFrame>
  );
}
