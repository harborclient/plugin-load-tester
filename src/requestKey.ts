/**
 * Builds a stable key for per-request load test results from draft fields.
 *
 * @param draft - Request draft with method and url.
 */
export function requestKey(draft: { method?: string; url?: string }): string {
  const method = typeof draft.method === 'string' ? draft.method.trim().toUpperCase() : 'GET';
  const url = typeof draft.url === 'string' ? draft.url.trim() : '';
  return `${method} ${url}`;
}
