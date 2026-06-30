import type { ReactPortal } from 'react';
import { useEffect, useId, useState } from '@harborclient/sdk/react';
import type { PluginContext } from '@harborclient/sdk';
import {
  Button,
  Modal,
  ModalFooter,
  Spinner,
  StatusMessage,
  portalToBody
} from '@harborclient/sdk/components';
import { logLoadTestRequest } from './consoleLog';
import { createHostSender } from './sendViaHost';
import { LoadTestForm } from './LoadTestForm';
import { LoadResultsView } from './LoadResultsView';
import { runLoadTest } from './loadEngine';
import { loadCollectionTargets } from './hostApi';
import { closeCollectionModal, type CollectionLoadTarget } from './modalSignal';
import { resolveSavedRequest } from './resolve';
import { abortRun, beginRun, clearAbortController, setProgress, setResult } from './store';
import type { LoadAggregate, LoadTestConfig } from './types';

interface Props {
  /** Plugin context used to load collection requests from the host. */
  hc: PluginContext;
  /** Collection or folder target selected from the sidebar menu. */
  target: CollectionLoadTarget;
  /** Called after the modal closes. */
  onClose: () => void;
}

const MODAL_PANEL_CLASS = 'load-tester-modal-panel';
const COLLECTION_RESULT_KEY = 'collection-load-test';

/**
 * Injects viewport-sized rules for the collection load test modal.
 */
function CollectionModalStyles() {
  /**
   * Adds modal sizing styles and removes them on unmount.
   */
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-load-tester-modal', 'true');
    style.textContent = `
      .${MODAL_PANEL_CLASS} {
        width: min(960px, 90vw) !important;
        max-width: min(960px, 90vw) !important;
        max-height: 85vh !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  return null;
}

/**
 * Modal for running a load test against every request in a collection or folder.
 */
export function CollectionLoadModal({ hc, target, onClose }: Props): ReactPortal {
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('Load Test');
  const [collectionName, setCollectionName] = useState<string | undefined>(undefined);
  const [requestCount, setRequestCount] = useState(0);
  const [result, setLocalResult] = useState<LoadAggregate | undefined>(undefined);
  const [progress, setLocalProgress] = useState({ completed: 0, total: 0 });

  /**
   * Loads collection metadata and counts saved requests for the selected target.
   */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    void loadCollectionTargets(hc, target.collectionId, target.folderId)
      .then(({ collectionName, requests }) => {
        if (cancelled) {
          return;
        }
        const scope = target.folderId != null ? 'folder' : 'collection';
        setTitle(`Load Test — ${collectionName}`);
        setCollectionName(collectionName);
        setRequestCount(requests.length);
        if (requests.length === 0) {
          setError(`This ${scope} has no saved requests to load test.`);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hc, target.collectionId, target.folderId]);

  /**
   * Runs a load test across every saved request in the selected collection scope.
   *
   * @param config - User-selected load test configuration.
   */
  const handleRun = async (config: LoadTestConfig): Promise<void> => {
    setError(null);
    setRunning(true);
    setLocalResult(undefined);

    try {
      const { requests, metadata } = await loadCollectionTargets(
        hc,
        target.collectionId,
        target.folderId
      );
      if (requests.length === 0) {
        throw new Error('No saved requests are available for this target.');
      }

      const targets = requests.map((request) => resolveSavedRequest(request, metadata));
      const controller = beginRun(COLLECTION_RESULT_KEY);
      setLocalProgress({ completed: 0, total: config.count });
      setProgress(COLLECTION_RESULT_KEY, { completed: 0, total: config.count, running: true });

      const aggregate = await runLoadTest(targets, config, {
        signal: controller.signal,
        send: createHostSender(hc),
        onProgress: (completed, total) => {
          setLocalProgress({ completed, total });
          setProgress(COLLECTION_RESULT_KEY, { completed, total, running: true });
        },
        onRequestComplete: ({ target: completedTarget, sample, result }) => {
          logLoadTestRequest(hc, {
            requestName: sample.requestName ?? completedTarget.name,
            collectionName,
            result
          });
        }
      });

      setLocalResult(aggregate);
      setResult(COLLECTION_RESULT_KEY, aggregate);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : String(runError));
      setProgress(COLLECTION_RESULT_KEY, {
        completed: progress.completed,
        total: progress.total,
        running: false
      });
    } finally {
      clearAbortController(COLLECTION_RESULT_KEY);
      setRunning(false);
    }
  };

  return portalToBody(
    <>
      <CollectionModalStyles />
      <Modal
        labelledBy={titleId}
        title={title}
        onClose={() => {
          closeCollectionModal();
          onClose();
        }}
        overlayClassName="z-[1000]"
        className={`${MODAL_PANEL_CLASS} flex flex-col overflow-hidden`}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {loading ? <Spinner label="Loading collection requests…" /> : null}
          {error ? (
            <StatusMessage live className="text-danger">
              {error}
            </StatusMessage>
          ) : null}

          {!loading && requestCount > 0 ? (
            <p className="text-[14px] text-muted">
              Requests are executed in sidebar order and round-robined across the configured total
              request count. Renderer fetch is subject to CORS; use local or CORS-enabled targets.
            </p>
          ) : null}

          {!loading && requestCount > 0 ? (
            <LoadTestForm
              running={running}
              runLabel="Run collection load test"
              onRun={(config) => {
                void handleRun(config);
              }}
              onCancel={() => {
                abortRun(COLLECTION_RESULT_KEY);
              }}
            />
          ) : null}

          {running ? (
            <Spinner label={`Running load test (${progress.completed}/${progress.total})`} />
          ) : null}

          <LoadResultsView result={result} title="Collection results" hc={hc} />
        </div>

        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              closeCollectionModal();
              onClose();
            }}
          >
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </>
  ) as ReactPortal;
}
