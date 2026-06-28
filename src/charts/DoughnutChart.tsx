import { useEffect, useRef } from '@harborclient/sdk/react';
import { Chart, type ChartConfiguration } from 'chart.js';
import { destroyChart, ensureChartsRegistered, themeColor } from './chartUtils';
import { ChartFrame } from './ChartFrame';

interface Props {
  /** Outcome labels such as HTTP status codes or error. */
  labels: string[];
  /** Counts for each label. */
  values: number[];
}

/**
 * Doughnut chart for HTTP status and error distribution.
 */
export function DoughnutChart({ labels, values }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart<'doughnut'> | null>(null);

  /**
   * Creates or updates the Chart.js doughnut chart when data changes.
   */
  useEffect(() => {
    ensureChartsRegistered();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    destroyChart(chartRef.current);

    try {
      const colors = [
        themeColor('success', '#22c55e'),
        themeColor('warning', '#f59e0b'),
        themeColor('danger', '#ef4444'),
        themeColor('info', '#38bdf8'),
        themeColor('accent', '#3b82f6')
      ];

      const config: ChartConfiguration<'doughnut'> = {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: labels.map((_, index) => colors[index % colors.length] as string),
              borderWidth: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                color: themeColor('text', '#e5e7eb'),
                font: { size: 14 }
              }
            },
            tooltip: {
              titleFont: { size: 14 },
              bodyFont: { size: 14 }
            }
          }
        }
      };

      chartRef.current = new Chart(canvas, config);
      requestAnimationFrame(() => {
        chartRef.current?.resize();
      });
    } catch (error) {
      console.error('[load-tester] failed to render doughnut chart', error);
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
      <canvas ref={canvasRef} aria-label="Status distribution chart" role="img" />
    </ChartFrame>
  );
}
