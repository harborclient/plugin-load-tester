import type { PluginContext } from '@harborclient/sdk';
import type { HostSendResult, LoadSender } from './loadEngine';
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

    return host.sendHttpRequest({
      method: target.method.toUpperCase(),
      url: target.url,
      headers,
      params: [],
      body: target.body ?? '',
      bodyType: target.bodyType ?? (target.body?.trim() ? 'text' : 'none')
    });
  };
}
