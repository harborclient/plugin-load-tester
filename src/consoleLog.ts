import type { PluginContext } from '@harborclient/sdk';
import type { HostSendResult } from './loadEngine';

/**
 * Payload forwarded to HarborClient footer console logging.
 */
export interface ConsoleLogPayload {
  /** Display name shown in the footer console row. */
  requestName: string;
  /** Optional collection label prefixed in the console row. */
  collectionName?: string;
  /** Send-result metadata for the completed request. */
  result: HostSendResult;
}

/**
 * Host helpers required for footer console logging.
 */
interface ConsoleHostApi {
  logRequestToConsole(payload: ConsoleLogPayload): Promise<void>;
}

/**
 * Returns the extended host API when available on the plugin context.
 *
 * @param hc - Renderer plugin context from HarborClient.
 */
function getConsoleHost(hc: PluginContext): ConsoleHostApi {
  const host = hc.host as PluginContext['host'] & Partial<ConsoleHostApi>;
  if (typeof host.logRequestToConsole !== 'function') {
    throw new Error(
      'Load Tester requires HarborClient host console logging. Update HarborClient to the latest version.'
    );
  }
  return host as ConsoleHostApi;
}

/**
 * Appends one load test request result to the HarborClient footer console.
 *
 * @param hc - Renderer plugin context from HarborClient.
 * @param payload - Console entry fields for the completed request.
 */
export function logLoadTestRequest(hc: PluginContext, payload: ConsoleLogPayload): void {
  const host = getConsoleHost(hc);
  void host.logRequestToConsole(payload);
}
