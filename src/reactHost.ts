import type { ReactNode, ReactPortal } from 'react';
import { createPortal } from 'react-dom';

/**
 * Portals modal content to document.body so fixed positioning is not clipped by the sidebar.
 *
 * @param node - Modal element to render.
 */
export function portalToBody(node: ReactNode): ReactPortal | ReactNode {
  if (typeof document !== 'undefined') {
    return createPortal(node, document.body);
  }
  return node;
}
