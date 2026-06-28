import type { PluginContext } from '@harborclient/sdk';
import type { CollectionMetadata, SavedRequestRow } from './resolve';

/**
 * Host helpers added by HarborClient for collection load testing.
 */
interface LoadTestHostApi {
  listCollectionRequests(
    collectionId: number,
    folderId?: number | null
  ): Promise<SavedRequestRow[]>;
  getCollectionMetadata(collectionId: number): Promise<CollectionMetadata & { name: string }>;
}

/**
 * Returns the extended host API when available on the plugin context.
 *
 * @param hc - Renderer plugin context from HarborClient.
 */
function getLoadTestHost(hc: PluginContext): LoadTestHostApi {
  const host = hc.host as PluginContext['host'] & Partial<LoadTestHostApi>;
  if (
    typeof host.listCollectionRequests !== 'function' ||
    typeof host.getCollectionMetadata !== 'function'
  ) {
    throw new Error(
      'Load Tester requires HarborClient host helpers for collection requests. Update HarborClient to the latest version.'
    );
  }
  return host as LoadTestHostApi;
}

/**
 * Loads ordered saved requests and collection metadata for a collection load test.
 *
 * @param hc - Renderer plugin context from HarborClient.
 * @param collectionId - Collection database id.
 * @param folderId - Folder id for folder runs; omit for the full collection.
 */
export async function loadCollectionTargets(
  hc: PluginContext,
  collectionId: number,
  folderId?: number | null
): Promise<{ collectionName: string; requests: SavedRequestRow[]; metadata: CollectionMetadata }> {
  const host = getLoadTestHost(hc);
  const [requests, collection] = await Promise.all([
    host.listCollectionRequests(collectionId, folderId),
    host.getCollectionMetadata(collectionId)
  ]);

  return {
    collectionName: collection.name,
    requests,
    metadata: {
      headers: collection.headers,
      auth: collection.auth,
      variables: collection.variables
    }
  };
}
