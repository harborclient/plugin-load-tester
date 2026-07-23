import type { PluginContext } from '@harborclient/sdk';
import type { HostSendResult, LoadSender } from './loadEngine';
import { isFatalHostSendError } from './loadEngine';
import type { LoadTarget } from './types';

/**
 * Key-value row shape accepted by the host send API.
 */
interface KeyValueRow {
  key: string;
  value: string;
  enabled: boolean;
}

/**
 * Request input accepted by the HarborClient host send API.
 */
interface HostSendInput {
  method: string;
  url: string;
  headers: KeyValueRow[];
  params: KeyValueRow[];
  body: string;
  bodyType: string;
}

/**
 * Host helper required to send requests through the main-process pipeline.
 */
interface HttpSendHostApi {
  sendHttpRequest(input: HostSendInput): Promise<HostSendResult>;
}

/**
 * Returns the host send API when available on the plugin context.
 *
 * @param hc - Renderer plugin context from HarborClient.
 */
function getHttpSendHost(hc: PluginContext): HttpSendHostApi {
  const host = hc.host as PluginContext['host'] & Partial<HttpSendHostApi>;
  if (typeof host.sendHttpRequest !== 'function') {
    throw new Error(
      'Load Tester requires HarborClient main-process HTTP sending. Update HarborClient to the latest version.'
    );
  }
  return host as HttpSendHostApi;
}

/**
 * Rewrites host permission/network gate failures into a clear load-test error.
 *
 * @param error - Rejection from {@link HttpSendHostApi.sendHttpRequest}.
 * @returns Original error, or a rewritten Error for fatal host gates.
 */
export function rewriteHostSendError(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (!isFatalHostSendError(message)) {
    return error;
  }

  if (message.includes('lacks permission: network')) {
    return new Error(
      'Load Tester requires the network permission. Reinstall or update the plugin so its manifest declares "network".'
    );
  }

  if (message.includes('cannot make network requests')) {
    return new Error(
      'Load Tester cannot send requests until network access is granted. Enable "Allow script network requests" in Settings → General, or allow this plugin during install.'
    );
  }

  return error instanceof Error ? error : new Error(message);
}

/**
 * Builds a load sender that routes each request through the host main process,
 * bypassing the renderer CORS restrictions that block direct `fetch`.
 *
 * @param hc - Renderer plugin context from HarborClient.
 */
export function createHostSender(hc: PluginContext): LoadSender {
  const host = getHttpSendHost(hc);

  /**
   * Sends one resolved target through the host and returns its result.
   *
   * @param target - Fully resolved HTTP target.
   */
  return async (target: LoadTarget): Promise<HostSendResult> => {
    const headers: KeyValueRow[] = Object.entries(target.headers).map(([key, value]) => ({
      key,
      value,
      enabled: true
    }));

    try {
      return await host.sendHttpRequest({
        method: target.method.toUpperCase(),
        url: target.url,
        headers,
        params: [],
        body: target.body ?? '',
        bodyType: target.bodyType ?? (target.body?.trim() ? 'text' : 'none')
      });
    } catch (error) {
      throw rewriteHostSendError(error);
    }
  };
}
