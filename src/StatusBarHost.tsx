import type { PluginContext } from '@harborclient/sdk';
import { CollectionLoadModal } from './CollectionLoadModal';
import { closeCollectionModal, useCollectionModalState } from './modalSignal';

interface Props {
  /** Plugin context passed from activate(). */
  hc: PluginContext;
}

/**
 * Invisible status bar host that keeps the collection load test modal mounted.
 */
export function StatusBarHost({ hc }: Props) {
  const modal = useCollectionModalState();

  if (!modal.open || !modal.target) {
    return null;
  }

  return (
    <CollectionLoadModal
      hc={hc}
      target={modal.target}
      onClose={() => {
        closeCollectionModal();
      }}
    />
  );
}
