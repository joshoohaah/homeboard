const POLL_MS = 60_000;
const FADE_MS = 1500;
const $ = (id) => document.getElementById(id);

function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((c) => c != null));
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

function drawClock() {
  const opts = { timeZone: board?.timeZone };
  const parts = new Intl.DateTimeFormat('en-US', { ...opts, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts();
  const get = (type) => parts.find((p) => p.type === type).value;
  $('clock').replaceChildren(`${get('hour')}:${get('minute')}`, el('small', '', get('dayPeriod')));
  $('date').textContent = new Intl.DateTimeFormat('en-US', { ...opts, weekday: 'long', month: 'long', day: 'numeric' }).format();
}

function drawWeather({ weather, aqi }) {
  if (weather) {
    $('now').replaceChildren(
      el('div', 'temp', `${weather.temp}°`, icon(weather.icon)),
      el('p', '', `Feels like ${weather.feels}`), el('p', '', weather.label));
    $('forecast').replaceChildren(...weather.days.map((d) => el('div', '',
      el('div', '', d.date === board.today ? 'Today' : new Date(`${d.date}T12:00`).toLocaleDateString('en-US', { weekday: 'short' })),
      icon(d.icon), el('div', 'rain', icon('water'), `${d.rain}%`),
      el('div', 'hl', el('span', '', String(d.high)), el('span', '', String(d.low))))));
  }
  $('aqi').className = aqi?.level ?? '';
  $('aqi').replaceChildren(...(aqi ? [aqi.label, el('b', '', String(aqi.value))] : []));
}

function drawWord(w) {
  $('word').replaceChildren(...(w ? [el('h2', '', w.word),
    el('p', '', el('b', '', w.word), `  ‖  \\${w.say}\\  ‖  `, el('em', '', w.kind)), el('p', '', w.text)] : []));
}

function drawEvent(e) {
  return tint(el('div', e.filled ? 'ev filled' : 'ev',
    e.filled && !e.icon ? null : marker(e), e.time && el('time', '', e.time), e.title), e.color);
}

function drawCalendar({ legend, weeks }) {
  $('legend').replaceChildren('LEGEND', ...legend.map((c) => tint(el('span', '', marker(c), c.name), c.color)));
  $('names').replaceChildren(el('span'), ...'SMTWTFS'.split('').map((d) => el('span', '', d)));
  $('grid').replaceChildren(...weeks.map((w) => el('div', 'week', el('div', 'num', String(w.number)),
    ...w.days.map((d) => el('div', ['day', d.today && 'today', d.past && 'past'].filter(Boolean).join(' '),
      el('div', 'label', el('b', '', d.label)), ...d.events.map(drawEvent))))));
}

function drawWarning() {
  const offline = failedSince && Date.now() - failedSince > 5 * POLL_MS;
  const text = offline ? 'Board server unreachable: showing saved data'
    : board?.problems.length ? `Not updating: ${board.problems.join(', ')}` : '';
  $('warn').textContent = text;
  $('warn').hidden = !text;
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
      drawWeather(board); drawWord(board.word); drawCalendar(board); drawClock();
      if (!$('photo').firstChild) nextPhoto();
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
  if (!board?.photos.length) return;
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
  const slide = el('div', '', back, front);
  const old = [...$('photo').children];
  $('photo').append(slide);
  slide.offsetWidth; // start the fade from opacity 0
  slide.classList.add('show');
  setTimeout(() => old.forEach((o) => o.remove()), FADE_MS);
}

drawClock();
setInterval(drawClock, 1000);
poll();
setInterval(poll, POLL_MS);
