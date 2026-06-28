import type {
  AuthConfig,
  BodyType,
  RequestDraft,
  RequestTabContext,
  Variable
} from '@harborclient/sdk';
import { resolveRequest } from '@harborclient/sdk/http';
import type { LoadTarget } from './types';

/**
 * Saved request row shape returned by the HarborClient host helper.
 */
export interface SavedRequestRow {
  id: number;
  name: string;
  method: string;
  url: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  params: Array<{ key: string; value: string; enabled: boolean }>;
  auth: AuthConfig;
  body: string;
  body_type: BodyType;
}

/**
 * Collection metadata needed to resolve saved requests.
 */
export interface CollectionMetadata {
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  auth: AuthConfig;
  variables: Variable[];
}

/**
 * Converts collection variables into a flat lookup map.
 *
 * @param variables - Collection variable rows.
 */
export function variablesRecord(variables: Variable[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const variable of variables) {
    const value = variable.value.trim();
    result[variable.key] = value || variable.defaultValue;
  }
  return result;
}

/**
 * Resolves the active request editor tab into a fetchable load target.
 *
 * @param context - Read-only request tab context from HarborClient.
 */
export function resolveFromContext(context: RequestTabContext): LoadTarget {
  const resolved = resolveRequest(context);
  return {
    name: `${context.draft.method.trim().toUpperCase()} ${context.draft.url.trim()}`,
    method: resolved.method,
    url: resolved.url,
    headers: resolved.headers,
    body: resolved.body,
    bodyType: context.draft.body_type
  };
}

/**
 * Builds a synthetic request tab context for a saved collection request.
 *
 * @param request - Saved request row from the host.
 * @param collection - Collection metadata for auth, headers, and variables.
 */
function buildSavedRequestContext(
  request: SavedRequestRow,
  collection: CollectionMetadata
): RequestTabContext {
  const draft: RequestDraft = {
    method: request.method,
    url: request.url,
    params: request.params,
    headers: request.headers,
    body: request.body,
    auth: request.auth,
    body_type: request.body_type
  };

  return {
    draft,
    response: null,
    readOnly: true,
    collectionAuth: collection.auth,
    collectionHeaders: collection.headers,
    variables: variablesRecord(collection.variables)
  };
}

/**
 * Resolves a saved collection request into a fetchable load target.
 *
 * @param request - Saved request row from the host.
 * @param collection - Collection metadata for auth, headers, and variables.
 */
export function resolveSavedRequest(
  request: SavedRequestRow,
  collection: CollectionMetadata
): LoadTarget {
  const resolved = resolveRequest(buildSavedRequestContext(request, collection));
  return {
    name: request.name,
    method: resolved.method,
    url: resolved.url,
    headers: resolved.headers,
    body: resolved.body,
    bodyType: request.body_type
  };
}

/**
 * Returns true when a URL hostname looks like a local development target.
 *
 * @param url - Request URL to inspect.
 */
export function isLikelyLocalTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.endsWith('.local') ||
      host.endsWith('.localhost')
    );
  } catch {
    return false;
  }
}
