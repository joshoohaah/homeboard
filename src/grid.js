// Pure: turns a flat event list into the week grid the board draws.
// All day math is local to the process time zone (TZ).

export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Constructing by parts (not adding 24h) keeps DST days correct.
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

export function gridRange(now, weeks) {
  const start = addDays(now, -now.getDay());
  return { start, end: addDays(start, weeks * 7) };
}

export function isoWeek(date) {
  const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / 86400000 + 1) / 7);
}

const timeLabel = (d) => {
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};

function bounds(event) {
  const s = event.allDay ? parseYmd(event.start) : new Date(event.start);
  const e = event.allDay ? parseYmd(event.end) : new Date(event.end);
  const first = addDays(s, 0);
  // Ends are exclusive: midnight belongs to the previous day.
  const last = e > s ? addDays(new Date(e.getTime() - 1), 0) : first;
  return { s, first, last };
}

/** Map of day -> entries, filled bars first, then by time. */
export function eventsByDay(events, range) {
  const days = new Map();
  for (const event of events) {
    const { s, first, last } = bounds(event);
    const filled = event.allDay || first.getTime() !== last.getTime();
    for (let d = first < range.start ? range.start : first; d <= last && d < range.end; d = addDays(d, 1)) {
      const showTime = !event.allDay && ymd(d) === ymd(first);
      const entry = {
        title: event.title, color: event.color, icon: event.icon ?? null, filled,
        time: showTime ? timeLabel(s) : null,
        sort: `${filled ? 0 : 1}|${filled ? ymd(first) : s.toISOString()}|${String(event.order ?? 0).padStart(3, '0')}|${event.title}`,
      };
      days.set(ymd(d), [...(days.get(ymd(d)) ?? []), entry]);
    }
  }
  return new Map([...days].map(([k, list]) => [
    k, list.toSorted((a, b) => (a.sort < b.sort ? -1 : 1)).map(({ sort, ...rest }) => rest),
  ]));
}

export function buildWeeks(events, now, weeks) {
  const range = gridRange(now, weeks);
  const byDay = eventsByDay(events, range);
  const today = ymd(now);
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
    return { number: isoWeek(addDays(range.start, w * 7 + 1)), days };
  });
}
