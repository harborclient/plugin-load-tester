import type { ReactNode } from 'react';

/** Inline chart frame sizing — plugin Tailwind classes are not scanned by the host app. */
const CHART_FRAME_STYLE = {
  position: 'relative',
  height: '240px',
  width: '100%'
} as const;

interface Props {
  /** Chart canvas rendered inside the sized frame. */
  children: ReactNode;
}

/**
 * Fixed-size wrapper required by Chart.js when maintainAspectRatio is false.
 */
export function ChartFrame({ children }: Props) {
  return <div style={CHART_FRAME_STYLE}>{children}</div>;
}
