// Pure: turns a flat event list into the week grid the board draws.
// All day math is local to the process time zone (TZ).

export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Constructing by parts (not adding 24h) keeps DST days correct.
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

const FIRST_DAY = { sunday: 0, monday: 1 };
const DAY_LETTERS = 'SMTWTFS';

/** Weeks start on the configured day and the current week is always first. */
export function gridRange(now, weeks, weekStart = 'monday') {
  const back = (now.getDay() - FIRST_DAY[weekStart] + 7) % 7;
  const start = addDays(now, -back);
  return { start, end: addDays(start, weeks * 7) };
}

export const dayLetters = (weekStart = 'monday') =>
  Array.from({ length: 7 }, (_, i) => DAY_LETTERS[(FIRST_DAY[weekStart] + i) % 7]);

export function isoWeek(date) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
}

/** "6:00pm" (long) or "6p" / "12:41p" (short). */
export function timeLabel(d, format = 'long') {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (format === 'short') return `${h % 12 || 12}${mm === '00' ? '' : `:${mm}`}${h < 12 ? 'a' : 'p'}`;
  return `${h % 12 || 12}:${mm}${h < 12 ? 'am' : 'pm'}`;
}

function bounds(event) {
  const s = event.allDay ? parseYmd(event.start) : new Date(event.start);
  const e = event.allDay ? parseYmd(event.end) : new Date(event.end);
  const first = addDays(s, 0);
  // Ends are exclusive: midnight belongs to the previous day.
  const last = e > s ? addDays(new Date(e.getTime() - 1), 0) : first;
  return { s, first, last };
}

/** Map of day -> entries, filled bars first, then by time. */
export function eventsByDay(events, range, timeFormat = 'long') {
  const days = new Map();
  for (const event of events) {
    const { s, first, last } = bounds(event);
    const filled = event.allDay || first.getTime() !== last.getTime();
    for (let d = first < range.start ? range.start : first; d <= last && d < range.end; d = addDays(d, 1)) {
      const showTime = !event.allDay && ymd(d) === ymd(first);
      const entry = {
        title: event.title, color: event.color, icon: event.icon ?? null, filled,
        ...(event.calendar && { calendar: event.calendar }),
        time: showTime ? timeLabel(s, timeFormat) : null,
        sort: `${filled ? 0 : 1}|${filled ? ymd(first) : s.toISOString()}|${String(event.order ?? 0).padStart(3, '0')}|${event.title}`,
      };
      days.set(ymd(d), [...(days.get(ymd(d)) ?? []), entry]);
    }
  }
  return new Map([...days].map(([k, list]) => [
    k, list.toSorted((a, b) => (a.sort < b.sort ? -1 : 1)).map(({ sort, ...rest }) => rest),
  ]));
}

/** @param {{ weeks: number, weekStart?: 'monday'|'sunday', timeFormat?: 'short'|'long' }} options */
export function buildWeeks(events, now, { weeks, weekStart = 'monday', timeFormat = 'long' }) {
  const range = gridRange(now, weeks, weekStart);
  const byDay = eventsByDay(events, range, timeFormat);
  const today = ymd(now);
  // ISO weeks run Monday to Sunday: name a Sunday-first row after its Monday.
  const isoOffset = weekStart === 'sunday' ? 1 : 0;
  return Array.from({ length: weeks }, (_, w) => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(range.start, w * 7 + i);
      const key = ymd(d);
      const monthLabel = d.getDate() === 1 || (w === 0 && i === 0 && key !== today);
      return {
        date: key, today: key === today, past: key < today,
        label: monthLabel ? d.toLocaleString('en-US', { month: 'short' }) : String(d.getDate()),
        events: byDay.get(key) ?? [],
      };
    });
    return { number: isoWeek(addDays(range.start, w * 7 + isoOffset)), days };
  });
}
