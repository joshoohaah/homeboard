import ical from 'node-ical';
import { fetchOk } from './http.js';
import { ymd, addDays } from './grid.js';

const textOf = (v) => (typeof v === 'object' && v ? v.val : v) || '(no title)';

function normalize(inst) {
  const allDay = Boolean(inst.isFullDay);
  const start = new Date(inst.start);
  const rawEnd = new Date(inst.end ?? inst.start);
  const end = allDay && rawEnd <= start ? addDays(start, 1) : rawEnd;
  return {
    title: String(textOf(inst.summary)), allDay,
    start: allDay ? ymd(start) : start.toISOString(),
    end: allDay ? ymd(end) : end.toISOString(),
  };
}

export function parseIcs(text, range) {
  return Object.values(ical.sync.parseICS(text))
    .filter((e) => e?.type === 'VEVENT' && e.start && e.status !== 'CANCELLED')
    .flatMap((e) => ical.expandRecurringEvent(e, { from: range.start, to: range.end, expandOngoing: true }))
    .filter((inst) => inst.event?.status !== 'CANCELLED')
    .map(normalize);
}

export async function fetchIcs(url, range) {
  const text = await (await fetchOk(url.replace(/^webcal:/, 'https:'))).text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Feed is not an iCalendar file');
  return parseIcs(text, range);
}
