import './databaseTypes';
import type { PluginContext } from '@harborclient/sdk';
import { initDatabase } from './db';
import { openCollectionModal } from './modalSignal';
import { LoadTesterTab } from './LoadTesterTab';
import { ResponseLoadTab } from './ResponseLoadTab';
import { StatusBarHost } from './StatusBarHost';
import { initStore, disposeStore } from './store';

/**
 * Registers load tester request tab, response tab, collection menu action, and modal host.
 *
 * @param hc - SDK surface from HarborClient.
 */
export function activate(hc: PluginContext): void {
  void initStore(hc);
  void initDatabase(hc);

  hc.subscriptions.push({ dispose: disposeStore });
  hc.subscriptions.push(
    hc.ui.registerRequestTab({
      id: 'load-tester',
      title: 'Load Tester',
      order: 55,
      Component: ({ context }) => <LoadTesterTab hc={hc} context={context} />
    }),
    hc.ui.registerResponseTab({
      id: 'load-testing',
      title: 'Load Testing',
      order: 55,
      // Host supports `noResponse`; cast until SDK types include it.
      when: 'noResponse' as 'always',
      Component: ({ context }) => <ResponseLoadTab hc={hc} context={context} />
    }),
    hc.ui.registerStatusBarItem({
      id: 'modal-host',
      alignment: 'right',
      order: 999,
      Component: () => <StatusBarHost hc={hc} />
    }),
    hc.commands.register('load-test.collection', (payload) => {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Load Test requires a collection or folder target.');
      }
      const { collectionId, folderId } = payload as {
        collectionId?: unknown;
        folderId?: unknown;
      };
      if (typeof collectionId !== 'number') {
        throw new Error('Load Test requires a numeric collectionId.');
      }
      openCollectionModal({
        collectionId,
        folderId: typeof folderId === 'number' ? folderId : null
      });
    }),
    hc.ui.registerContextMenuItem({
      id: 'load-tester',
      title: 'Load Test',
      command: 'load-test.collection',
      when: ['collection', 'folder'],
      group: 'run',
      order: 10
    })
  );
}
