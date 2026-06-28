import { useSyncExternalStore } from '@harborclient/sdk/react';

/**
 * Target for a collection or folder load test opened from the sidebar menu.
 */
export interface CollectionLoadTarget {
  collectionId: number;
  folderId?: number | null;
}

interface ModalState {
  open: boolean;
  target: CollectionLoadTarget | null;
}

let modalState: ModalState = { open: false, target: null };
const listeners = new Set<() => void>();

/**
 * Notifies modal subscribers of a state change.
 */
function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Subscribes to modal open state for useSyncExternalStore.
 *
 * @param listener - Callback invoked when modal state changes.
 */
export function subscribeModal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns the current modal state snapshot.
 */
export function getModalSnapshot(): ModalState {
  return modalState;
}

/**
 * Opens the collection load test modal for one sidebar target.
 *
 * @param target - Collection or folder target from the context menu command.
 */
export function openCollectionModal(target: CollectionLoadTarget): void {
  modalState = { open: true, target };
  notify();
}

/**
 * Closes the collection load test modal.
 */
export function closeCollectionModal(): void {
  modalState = { open: false, target: null };
  notify();
}

/**
 * React hook for collection modal open state and target payload.
 */
export function useCollectionModalState(): ModalState {
  return useSyncExternalStore(subscribeModal, getModalSnapshot, getModalSnapshot);
}
