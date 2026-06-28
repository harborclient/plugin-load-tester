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
  /** X-axis labels. */
  labels: string[];
  /** Latency values in milliseconds. */
  values: number[];
}

/**
 * Line chart for latency over time during a load test run.
 */
export function LineChart({ labels, values }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'line'> | null>(null);

  /**
   * Creates or updates the Chart.js line chart when data changes.
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

      const config: ChartConfiguration<'line'> = {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Latency (ms)',
              data: values,
              borderColor: accent,
              backgroundColor: `${accent}33`,
              fill: true,
              tension: 0.25,
              pointRadius: values.length > 100 ? 0 : 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: chartPluginOptions(),
          scales: {
            x: {
              ...cartesianScaleOptions(),
              title: {
                display: true,
                text: 'Request #',
                color: muted,
                font: { size: 14 }
              }
            },
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
      console.error('[load-tester] failed to render line chart', error);
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
      <canvas ref={canvasRef} aria-label="Latency over time chart" role="img" />
    </ChartFrame>
  );
}
