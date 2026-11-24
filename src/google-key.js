import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Google OAuth client from the environment, else from the JSON file Google lets you download.
 * @returns {Promise<{ clientId?: string, clientSecret?: string }>}
 */
export async function loadGoogleKey(env, dataDir, redirectUri) {
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  let key;
  try { key = JSON.parse(await readFile(join(dataDir, 'google-client.json'), 'utf8')); } catch (err) {
    if (err.code === 'ENOENT') return {};
    // Not err.message: JSON errors quote the file, which holds the secret.
    throw new Error('google-client.json could not be read or is not valid JSON');
  }
  if (!key.web?.client_id || !key.web?.client_secret) {
    throw new Error('google-client.json must be for a "Web application" client');
  }
  if (!key.web.redirect_uris?.includes(redirectUri)) {
    console.warn(`google-client.json does not list ${redirectUri}; add it to the client in Google Cloud`);
  }
  return { clientId: key.web.client_id, clientSecret: key.web.client_secret };
}
