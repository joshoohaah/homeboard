import { timeLabel } from './grid.js';

const minutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/**
 * Whether `now` (local time, in the board's time zone) falls in a quiet window. A window belongs to the days it
 * starts on: Friday 23:00-08:00 also covers Saturday until 08:00.
 */
export function isNight(night, now) {
  if (night.mode === 'on') return true;
  if (night.mode === 'off' || !night.enabled) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  const yesterday = (today + 6) % 7;
  return night.windows.some(({ days, start, end }) => {
    const [s, e] = [minutes(start), minutes(end)];
    if (s < e) return days.includes(today) && t >= s && t < e;
    return (days.includes(today) && t >= s) || (days.includes(yesterday) && t < e);
  });
}

const DAY_MS = 86_400_000;

/** The next timed event starting within a day, for the quiet screen. */
export function nextEvent(events, now, timeFormat) {
  const soon = events
    .filter((e) => !e.allDay)
    .map((e) => ({ ...e, at: new Date(e.start) }))
    .filter((e) => e.at > now && e.at - now < DAY_MS)
    .toSorted((a, b) => a.at - b.at)[0];
  if (!soon) return null;
  const day = soon.at.getDate() === now.getDate() ? 'Today' : 'Tomorrow';
  return { title: soon.title, when: `${day} ${timeLabel(soon.at, timeFormat)}`, color: soon.color };
}
