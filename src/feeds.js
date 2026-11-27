import { fetchJson, fetchOk } from './http.js';

// WMO weather codes -> [label, MDI icon]
const CLOUDY = ['Cloudy', 'weather-cloudy'];
const WMO = {
  0: ['Clear', 'weather-sunny'], 1: ['Mostly clear', 'weather-sunny'], 2: ['Partly cloudy', 'weather-partly-cloudy'],
  3: CLOUDY, 45: ['Fog', 'weather-fog'], 48: ['Fog', 'weather-fog'],
  51: ['Drizzle', 'weather-rainy'], 53: ['Drizzle', 'weather-rainy'], 55: ['Drizzle', 'weather-rainy'],
  56: ['Freezing drizzle', 'weather-snowy-rainy'], 57: ['Freezing drizzle', 'weather-snowy-rainy'],
  61: ['Light rain', 'weather-rainy'], 63: ['Rain', 'weather-pouring'], 65: ['Heavy rain', 'weather-pouring'],
  66: ['Freezing rain', 'weather-snowy-rainy'], 67: ['Freezing rain', 'weather-snowy-rainy'],
  71: ['Light snow', 'weather-snowy'], 73: ['Snow', 'weather-snowy'], 75: ['Heavy snow', 'weather-snowy-heavy'],
  77: ['Snow grains', 'weather-snowy'], 80: ['Showers', 'weather-rainy'], 81: ['Showers', 'weather-pouring'],
  82: ['Heavy showers', 'weather-pouring'], 85: ['Snow showers', 'weather-snowy'], 86: ['Snow showers', 'weather-snowy-heavy'],
  95: ['Thunderstorm', 'weather-lightning-rainy'], 96: ['Thunderstorm', 'weather-hail'], 99: ['Thunderstorm', 'weather-hail'],
};
export const describe = (code, isDay = true) => {
  const [label, icon] = WMO[code] ?? CLOUDY;
  return { label, icon: !isDay && code <= 1 ? 'weather-night' : icon };
};

const AQI_BANDS = [[50, 'Good', 'good'], [100, 'Moderate', 'moderate'], [150, 'Sensitive', 'sensitive'],
  [200, 'Unhealthy', 'unhealthy'], [300, 'Very Unhealthy', 'very'], [Infinity, 'Hazardous', 'hazard']];
export const aqiBand = (raw) => {
  const value = Math.round(raw);
  const [, label, level] = AQI_BANDS.find(([max]) => value <= max);
  return { value, label, level };
};

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export async function fetchWeather({ latitude, longitude, units = 'fahrenheit' }) {
  const w = await fetchJson(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
    latitude, longitude, temperature_unit: units, timezone: timezone(), forecast_days: 5,
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  })}`);
  return {
    temp: Math.round(w.current.temperature_2m), feels: Math.round(w.current.apparent_temperature),
    ...describe(w.current.weather_code, w.current.is_day === 1),
    days: w.daily.time.map((date, i) => ({
      date, icon: describe(w.daily.weather_code[i]).icon,
      high: Math.round(w.daily.temperature_2m_max[i]), low: Math.round(w.daily.temperature_2m_min[i]),
      rain: w.daily.precipitation_probability_max[i] ?? 0,
    })),
  };
}

export async function fetchAqi({ latitude, longitude }) {
  const a = await fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?${new URLSearchParams({
    latitude, longitude, current: 'us_aqi',
  })}`);
  if (!Number.isFinite(a.current?.us_aqi)) throw new Error('No AQI reading');
  return aqiBand(a.current.us_aqi);
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–' };
const MAX_CODE_POINT = 0x10ffff;
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, e) => {
  if (e[0] !== '#') return ENTITIES[e] ?? all;
  const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
  return code <= MAX_CODE_POINT ? String.fromCodePoint(code) : all;
});
const plain = (html) => decode(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

export function parseWord(xml) {
  const item = xml.match(/<item>([\s\S]*?)<\/item>/)?.[1] ?? '';
  const word = item.match(/<title><!\[CDATA\[(.*?)\]\]>/)?.[1];
  const html = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]>/)?.[1] ?? '';
  // The definition follows the line with the pronunciation and part of speech.
  const m = html.match(/\\([^\\]+)\\[\s\S]*?<em>([^<]+)<\/em>\s*<br\s*\/?>\s*<p>([\s\S]*?)<\/p>/);
  if (!word || !m) throw new Error('Word of the day feed changed shape');
  return { word: plain(word), say: plain(m[1]), kind: plain(m[2]), text: plain(m[3]) };
}
export const fetchWord = async () =>
  parseWord(await (await fetchOk('https://www.merriam-webster.com/wotd/feed/rss2')).text());

/** ZenQuotes asks for a visible credit, which the board shows. */
export async function fetchQuote() {
  const [quote] = await fetchJson('https://zenquotes.io/api/today');
  if (!quote?.q || !quote.a) throw new Error('Quote feed changed shape');
  return { text: plain(quote.q), author: plain(quote.a), credit: 'ZenQuotes.io' };
}

/** JokeAPI with its safe mode, which leaves out anything not family-friendly. */
export async function fetchJoke() {
  const joke = await fetchJson('https://v2.jokeapi.dev/joke/Pun,Misc?safe-mode&type=single');
  if (joke.error || joke.safe !== true || typeof joke.joke !== 'string') throw new Error('No safe joke returned');
  return { text: plain(joke.joke) };
}
