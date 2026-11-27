import { fetchOk } from './http.js';

const label = (key) => key.replace(/^cal:/, '');

/**
 * Decides when a failing source is worth a message: once after `delayMinutes` of failures, once when it
 * recovers, never in between. State is kept in memory, so a restart during an outage alerts again once.
 */
export class Alerts {
  #down = new Map(); // key -> { since, alerted }

  constructor({ send, log = console.error, now = () => Date.now() }) {
    Object.assign(this, { send, log, now });
  }

  /** @param {{ key: string, error: string|null, at?: number|null }[]} status  @param {number} delayMinutes */
  async update(status, delayMinutes) {
    const messages = status.flatMap(({ key, error, at }) => this.#step(key, error, at, delayMinutes));
    await Promise.all(messages.map((m) => this.send(m).catch((err) => this.log('alert not sent:', err.message))));
    return messages;
  }

  #step(key, error, lastGood, delayMinutes) {
    const was = this.#down.get(key);
    if (!error) {
      this.#down.delete(key);
      return was?.alerted ? [{ event: 'recovered', source: label(key), message: `Homeboard: ${label(key)} is updating again.` }] : [];
    }
    const state = was ?? { since: this.now(), alerted: false };
    const due = !state.alerted && this.now() - state.since >= delayMinutes * 60_000;
    this.#down.set(key, { ...state, alerted: state.alerted || due });
    if (!due) return [];
    const time = (ms) => new Date(ms).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    const text = lastGood ? `has not updated since ${time(lastGood)}` : `has been failing since ${time(state.since)}`;
    return [{ event: 'down', source: label(key), error, message: `Homeboard: ${label(key)} ${text} (${error}).` }];
  }
}

/** Posts to a Home Assistant webhook (or anything that accepts JSON). */
export const webhookSender = (getUrl) => async (payload) => {
  const url = getUrl();
  if (!url) return;
  await fetchOk(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
};
