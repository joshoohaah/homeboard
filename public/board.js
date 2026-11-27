const POLL_MS = 60_000;
const FADE_MS = 1500;
const $ = (id) => document.getElementById(id);

function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((c) => c != null));
  return node;
}
function part(name, className = '') {
  const node = el('section', className);
  node.dataset.part = name;
  return node;
}
function icon(name) {
  const node = el('span', 'icon');
  node.style.setProperty('--i', `url(/icons/${name}.svg)`);
  return node;
}
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function tint(node, color) {
  node.style.setProperty('--c', color);
  node.style.setProperty('--t', luminance(color) > 0.6 ? '#111' : '#fff');
  node.style.setProperty('--m', luminance(color) < 0.15 ? `color-mix(in srgb, ${color}, white 45%)` : color);
  return node;
}
const marker = (e) => (e.icon ? icon(e.icon) : el('span', 'dot'));

let board = null;
let failedSince = null;
let parts = {};
let layoutKey = '';
let customVersion = null;

// ---- Panel and widgets ----

const CARDS = new Set(['word', 'quote', 'joke']);

function buildPanel(layout) {
  parts = Object.fromEntries(layout.widgets.map((w) => [w, part(w, CARDS.has(w) ? 'card' : '')]));
  const nodes = [];
  for (let i = 0; i < layout.widgets.length; i += 1) {
    const [a, b] = layout.widgets.slice(i, i + 2);
    // Weather and air quality sit side by side when they are next to each other.
    if ([a, b].sort().join() === 'aqi,weather') {
      const pair = el('div', '', parts[a], parts[b]);
      pair.dataset.part = 'weather-pair';
      nodes.push(pair);
      i += 1;
    } else nodes.push(parts[a]);
  }
  $('panel').replaceChildren(...nodes);
  if (parts.custom) {
    const frame = el('iframe');
    Object.assign(frame, { title: 'Custom', sandbox: '', src: `/custom.html?v=${customVersion}` });
    parts.custom.append(frame);
  }
  document.body.dataset.layout = layout.preset;
  document.body.dataset.legend = String(layout.legend);
  queue = [];
  nextPhoto();
}

function clockParts() {
  const opts = { timeZone: board?.timeZone };
  const p = new Intl.DateTimeFormat('en-US', { ...opts, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts();
  const get = (type) => p.find((x) => x.type === type).value;
  return {
    time: () => el('div', 'time', `${get('hour')}:${get('minute')}`, el('small', '', get('dayPeriod'))),
    date: () => el('div', 'date', new Intl.DateTimeFormat('en-US', { ...opts, weekday: 'long', month: 'long', day: 'numeric' }).format()),
  };
}

function drawClock() {
  const c = clockParts();
  parts.clock?.replaceChildren(c.time(), c.date());
  if (board?.night) drawNight(board, c);
}

/** Quiet mode: only the chosen parts, dimmed. */
function drawNight({ night, weather }, c = clockParts()) {
  const show = new Set(night.show);
  const next = night.next && tint(el('div', 'next', el('span', 'dot'), ` ${night.next.when}  ${night.next.title}`), night.next.color);
  const now = weather && el('div', 'now', icon(weather.icon), ` ${weather.temp}°`);
  $('night').style.setProperty('--hb-night-brightness', night.brightness / 100);
  $('night').replaceChildren(...[
    show.has('clock') && c.time(), show.has('date') && c.date(), show.has('next') && next, show.has('weather') && now,
  ].filter(Boolean));
}

function drawWeather({ weather, aqi, today }) {
  if (parts.weather && weather) {
    parts.weather.replaceChildren(el('div', 'temp', `${weather.temp}°`, icon(weather.icon)),
      el('p', '', `Feels like ${weather.feels}`), el('p', '', weather.label));
  }
  if (parts.forecast && weather) {
    parts.forecast.replaceChildren(...weather.days.map((d) => el('div', '',
      el('div', '', d.date === today ? 'Today' : new Date(`${d.date}T12:00`).toLocaleDateString('en-US', { weekday: 'short' })),
      icon(d.icon), el('div', 'rain', icon('water'), `${d.rain}%`),
      el('div', 'hl', el('span', '', String(d.high)), el('span', '', String(d.low))))));
  }
  if (parts.aqi) {
    parts.aqi.className = aqi?.level ?? '';
    parts.aqi.replaceChildren(...(aqi ? [aqi.label, el('b', '', String(aqi.value))] : []));
  }
}

function drawCards({ word, quote, joke }) {
  parts.word?.replaceChildren(...(word ? [el('h2', '', word.word),
    el('p', '', el('b', '', word.word), `  ‖  \\${word.say}\\  ‖  `, el('em', '', word.kind)), el('p', '', word.text)] : []));
  parts.quote?.replaceChildren(...(quote ? [el('h2', '', 'Quote of the day'), el('blockquote', '', quote.text),
    el('cite', '', `— ${quote.author}`), el('span', 'credit', `via ${quote.credit}`)] : []));
  parts.joke?.replaceChildren(...(joke ? [el('h2', '', 'Joke of the day'), el('p', '', joke.text)] : []));
}

function drawCustom(version) {
  if (version === customVersion) return;
  customVersion = version;
  $('custom-css').href = `/custom.css?v=${version}`;
  parts.custom?.querySelector('iframe')?.setAttribute('src', `/custom.html?v=${version}`);
}

// ---- Calendar ----

function drawEvent(e) {
  const node = tint(el('div', e.filled ? 'ev filled' : 'ev',
    e.filled && !e.icon ? null : marker(e), e.time && el('time', '', e.time), e.title), e.color);
  if (e.calendar) node.dataset.calendar = e.calendar;
  return node;
}

function drawDay(d) {
  const day = el('div', ['day', d.today && 'today', d.past && 'past'].filter(Boolean).join(' '),
    el('div', 'label', el('b', '', d.label)), el('div', 'events', ...d.events.map(drawEvent)));
  day.dataset.part = 'day';
  day.dataset.date = d.date;
  return day;
}

function drawCalendar({ legend, weeks, days }) {
  $('legend').replaceChildren('LEGEND', ...legend.map((c) => {
    const item = tint(el('span', '', marker(c), c.name), c.color);
    item.dataset.calendar = c.name;
    return item;
  }));
  $('names').replaceChildren(el('span'), ...days.map((d) => el('span', '', d)));
  $('grid').style.setProperty('--weeks', weeks.length);
  $('grid').replaceChildren(...weeks.map((w) => el('div', 'week', el('div', 'num', String(w.number)), ...w.days.map(drawDay))));
  requestAnimationFrame(fitAll);
}

const overflows = (box) => box.scrollHeight > box.clientHeight + 1;

/** Fixed rows: shrink a busy day's text first, then replace what still does not fit with "+N more". */
function fitDay(day) {
  const list = day.querySelector('.events');
  list.querySelector('.more')?.remove();
  const events = [...list.children];
  events.forEach((e) => { e.hidden = false; });
  day.classList.remove('tight');
  if (!overflows(list)) return;
  day.classList.add('tight');
  if (!overflows(list)) return;
  const more = el('div', 'more');
  list.append(more);
  for (let n = 1; n <= events.length && overflows(list); n += 1) {
    events[events.length - n].hidden = true;
    more.textContent = `+${n} more`;
  }
}
const fitAll = () => document.querySelectorAll('.day').forEach(fitDay);

// ---- Updates ----

function drawWarning() {
  const offline = failedSince && Date.now() - failedSince > 5 * POLL_MS;
  const text = offline ? 'Board server unreachable: showing saved data'
    : board?.problems.length ? `Not updating: ${board.problems.join(', ')}` : '';
  $('warn').textContent = text;
  $('warn').hidden = !text;
}

/**
 * A new server build means new page code: reload once. The session note stops a loop if the reloaded page
 * still reports a build it cannot load.
 */
let pageBuild = null;
function reloadForNewVersion(build) {
  pageBuild ??= build;
  if (!build || build === pageBuild) return false;
  try {
    if (sessionStorage.getItem('homeboard-reloaded-for') === build) return false;
    sessionStorage.setItem('homeboard-reloaded-for', build);
  } catch (err) {
    console.warn('cannot remember the reload, reloading anyway:', err.message);
  }
  location.reload();
  return true;
}

let last = '';
async function poll() {
  try {
    const res = await fetch('/api/board', { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    failedSince = null;
    if (text !== last) {
      last = text;
      board = JSON.parse(text);
      document.title = board.title;
      drawCustom(board.custom);
      const key = JSON.stringify(board.layout);
      if (key !== layoutKey) { layoutKey = key; buildPanel(board.layout); }
      if (reloadForNewVersion(board.build)) return;
      document.body.dataset.night = String(Boolean(board.night));
      $('night').hidden = !board.night;
      drawWeather(board); drawCards(board); drawCalendar(board); drawClock();
    }
  } catch (err) {
    console.warn('board update failed:', err.message);
    failedSince ??= Date.now();
  }
  drawWarning();
}

let queue = [];
let photoTimer;
async function nextPhoto() {
  clearTimeout(photoTimer);
  photoTimer = setTimeout(nextPhoto, (board?.photoSeconds ?? 30) * 1000);
  const frame = parts.photos;
  if (!frame || !board?.photos.length) return;
  if (!queue.length) queue = board.photos.map((id) => [Math.random(), id]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const [id, ...rest] = queue;
  queue = rest;
  const back = el('img', 'fill');
  const front = el('img');
  back.src = front.src = `/photos/${id}`;
  try { await front.decode(); } catch (err) {
    console.warn('skipping unreadable photo', id, err.message);
    return;
  }
  if (frame !== parts.photos) return; // the layout changed while loading
  const slide = el('div', '', back, front);
  const old = [...frame.children];
  frame.append(slide);
  slide.offsetWidth; // start the fade from opacity 0
  slide.classList.add('show');
  setTimeout(() => old.forEach((o) => o.remove()), FADE_MS);
}

let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitAll, 200); });
document.fonts.ready.then(fitAll);
// custom.css can change sizes after it loads.
$('custom-css').addEventListener('load', () => requestAnimationFrame(fitAll));

setInterval(drawClock, 1000);
poll();
setInterval(poll, POLL_MS);
