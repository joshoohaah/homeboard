const TIMEOUT_MS = 20_000;

export async function fetchOk(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // Host only: ICS URLs carry a secret in the path.
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res;
}
export const fetchJson = async (url, options) => (await fetchOk(url, options)).json();
