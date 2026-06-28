import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';

let registered = false;

/**
 * Registers Chart.js modules once for all plugin charts.
 *
 * Tree-shakeable Chart.js v4 requires controllers (not just elements and
 * scales) to be registered explicitly; omitting them makes `new Chart()` throw
 * a "not a registered controller" error.
 */
export function ensureChartsRegistered(): void {
  if (registered) {
    return;
  }
  Chart.register(
    LineController,
    BarController,
    DoughnutController,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Tooltip,
    Legend,
    Filler
  );
  registered = true;
}

/**
 * Reads a HarborClient theme CSS custom property when available.
 *
 * @param token - Token name without the `--mac-` prefix.
 * @param fallback - Value used when the token is unavailable.
 */
export function themeColor(token: string, fallback: string): string {
  if (typeof document === 'undefined') {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--mac-${token}`)
    .trim();
  return value || fallback;
}

/**
 * Returns shared axis styling for Cartesian charts.
 */
export function cartesianScaleOptions(): Record<string, unknown> {
  const muted = themeColor('muted', '#9ca3af');
  const grid = themeColor('separator', 'rgba(148, 163, 184, 0.25)');

  return {
    ticks: { color: muted, font: { size: 14 } },
    grid: { color: grid }
  };
}

/**
 * Returns shared legend and tooltip styling.
 */
export function chartPluginOptions(): Record<string, unknown> {
  const text = themeColor('text', '#e5e7eb');
  return {
    legend: {
      labels: {
        color: text,
        font: { size: 14 }
      }
    },
    tooltip: {
      titleFont: { size: 14 },
      bodyFont: { size: 14 }
    }
  };
}

/**
 * Destroys an existing Chart.js instance when its canvas unmounts or updates.
 *
 * @param chart - Chart instance to destroy.
 */
export function destroyChart(chart: Chart | null | undefined): void {
  chart?.destroy();
}
