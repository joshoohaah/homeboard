import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeks, eventsByDay, gridRange, isoWeek, timeLabel, dayLetters } from '../src/grid.js';
import { compileRules, shorten } from '../src/text.js';
import { parseIcs } from '../src/ics.js';
import { normalizeGoogle } from '../src/google.js';
import { parseWord, aqiBand, describe } from '../src/feeds.js';
import { validateConfig } from '../src/config.js';

const now = new Date(2026, 10, 24, 9, 45);
const range = gridRange(now, 6, 'sunday');
const cals = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body.trim().replace(/\n/g, '\r\n')}\r\nEND:VCALENDAR\r\n`;
const ev = (uid, rest) => `BEGIN:VEVENT\nUID:${uid}\nSUMMARY:${uid}\n${rest}\nEND:VEVENT\n`;

test('grid starts on Sunday, with the week numbers and labels DAKboard shows', () => {
  const weeks = buildWeeks([], now, { weeks: 6, weekStart: 'sunday' });
  assert.deepEqual(weeks.map((w) => w.number), [48, 49, 50, 51, 52, 53]);
  assert.equal(weeks[0].days[0].label, 'Nov');
  assert.equal(weeks[0].days[2].today, true);
  assert.equal(weeks[0].days[1].past, true);
  assert.equal(weeks[1].days[2].label, 'Dec');
});
test('iso week handles the year boundary', () => assert.equal(isoWeek(new Date(2027, 0, 4)), 1));
test('days stay distinct across a DST change', () => {
  const days = buildWeeks([], new Date(2026, 10, 1), { weeks: 1, weekStart: 'sunday' })[0].days.map((d) => d.date);
  assert.equal(new Set(days).size, 7);
  assert.equal(days[6], '2026-11-07');
});
test('all-day end is exclusive; timed multi-day fills and shows its time once', () => {
  const m = eventsByDay([
    { title: 'Trip', allDay: true, start: '2026-12-14', end: '2026-12-17' },
    { title: 'Invite', allDay: false, start: new Date(2026, 11, 18, 15).toISOString(), end: new Date(2026, 11, 19, 17).toISOString() },
  ], range);
  assert.ok(m.has('2026-12-16') && !m.has('2026-12-17'));
  assert.deepEqual([m.get('2026-12-18')[0].time, m.get('2026-12-19')[0].time, m.get('2026-12-19')[0].filled], ['3:00pm', null, true]);
});
test('event ending at midnight stays on its own day; started-earlier events are clipped', () => {
  const m = eventsByDay([
    { title: 'Late', allDay: false, start: new Date(2026, 10, 25, 22).toISOString(), end: new Date(2026, 10, 26).toISOString() },
    { title: 'Old', allDay: true, start: '2026-11-01', end: '2026-11-24' },
  ], range);
  assert.ok(m.has('2026-11-25') && !m.has('2026-11-26'));
  assert.ok(m.has('2026-11-22') && !m.has('2026-11-21'));
});
test('filled bars come before timed events, timed in order', () => {
  const t = (title, h) => ({ title, allDay: false, start: new Date(2026, 10, 25, h).toISOString(), end: new Date(2026, 10, 25, h + 1).toISOString() });
  const m = eventsByDay([t('b', 18), t('a', 9), { title: 'bar', allDay: true, start: '2026-11-25', end: '2026-11-26' }], range);
  assert.deepEqual(m.get('2026-11-25').map((e) => e.title), ['bar', 'a', 'b']);
});

test('ics: weekly rule with exdate, moved instance and other time zone', () => {
  const tz = 'TZID=America/Chicago';
  const got = parseIcs(cals(
    ev('a', `DTSTART;${tz}:20261020T180000\nDTEND;${tz}:20261020T190000\nRRULE:FREQ=WEEKLY;UNTIL=20261209T060000Z\nEXDATE;${tz}:20261201T180000`)
    + ev('a', `RECURRENCE-ID;${tz}:20261208T180000\nDTSTART;${tz}:20261208T193000\nDTEND;${tz}:20261208T203000`)
    + ev('b', 'DTSTART;TZID=America/New_York:20261203T180000\nDTEND;TZID=America/New_York:20261203T190000')), range);
  const by = eventsByDay(got, range);
  assert.deepEqual([...by.keys()].sort(), ['2026-11-24', '2026-12-03', '2026-12-08']);
  // wall-clock time must survive the November DST change
  assert.equal(by.get('2026-11-24')[0].time, '6:00pm');
  assert.deepEqual(by.get('2026-12-08').map((e) => e.time), ['7:30pm']);
  assert.equal(by.get('2026-12-03')[0].time, '5:00pm');
});
test('ics: all-day spans, missing DTEND, cancelled, ongoing at range start', () => {
  const got = parseIcs(cals(
    ev('break', 'DTSTART;VALUE=DATE:20261125\nDTEND;VALUE=DATE:20261128')
    + ev('single', 'DTSTART;VALUE=DATE:20261201')
    + ev('gone', 'STATUS:CANCELLED\nDTSTART;VALUE=DATE:20261202')
    + ev('ongoing', 'DTSTART;VALUE=DATE:20261120\nDTEND;VALUE=DATE:20261124')), range);
  assert.deepEqual([...eventsByDay(got, range).keys()].sort(),
    ['2026-11-22', '2026-11-23', '2026-11-25', '2026-11-26', '2026-11-27', '2026-12-01']);
});

test('google: event color kept, declined and cancelled dropped', () => {
  const base = { summary: 'X', start: { date: '2026-12-01' }, end: { date: '2026-12-02' } };
  assert.equal(normalizeGoogle({ ...base, colorId: '5' }).color, '#f6bf26');
  assert.equal('color' in normalizeGoogle(base), false);
  const labels = new Map([['L', '#123456']]);
  assert.equal(normalizeGoogle({ ...base, eventLabelId: 'L', colorId: '5' }, labels).color, '#123456');
  assert.equal(normalizeGoogle({ ...base, eventLabelId: 'gone', colorId: '5' }, labels).color, '#f6bf26');
  assert.equal(normalizeGoogle({ ...base, status: 'cancelled' }), null);
  assert.equal(normalizeGoogle({ ...base, attendees: [{ self: true, responseStatus: 'declined' }] }), null);
});

test('word of the day becomes plain text', () => {
  const w = parseWord(`<item><title><![CDATA[dubious]]></title><description><![CDATA[<p><strong>dubious</strong> &#149; \\DOO-bee-us\\&nbsp; &#149; <em>adjective</em><br />
<p><em>Dubious</em> means &quot;in doubt&quot;.</p></p>]]></description></item>`);
  assert.deepEqual(w, { word: 'dubious', say: 'DOO-bee-us', kind: 'adjective', text: 'Dubious means "in doubt".' });
  assert.throws(() => parseWord('<html>'));
});
test('aqi bands and night icon', () => {
  assert.equal(aqiBand(13).label, 'Good');
  assert.equal(aqiBand(51).level, 'moderate');
  assert.equal(describe(0, false).icon, 'weather-night');
  assert.equal(describe(1234).label, 'Cloudy');
});
test('config errors name the problem', () => {
  const ok = { location: { latitude: 1, longitude: 2 }, calendars: [] };
  const cal = { name: 'a', type: 'ics', url: 'https://x.test/a.ics', color: '#ffffff' };
  assert.equal(validateConfig(ok).weeks, 3);
  assert.throws(() => validateConfig({ ...ok, weeks: 7 }), /weeks/);
  assert.throws(() => validateConfig({ ...ok, weekStart: 'friday' }), /weekStart/);
  assert.throws(() => validateConfig({ ...ok, layout: { preset: 'middle' } }), /preset/);
  assert.throws(() => validateConfig({ ...ok, layout: { widgets: ['clock', 'clock'] } }), /widgets/);
  assert.throws(() => validateConfig({ ...ok, layout: { widgets: ['ads'] } }), /widgets/);
  assert.throws(() => validateConfig({ ...ok, shorten: [{ match: '(', replace: '', regex: true }] }), /pattern/);
  assert.throws(() => validateConfig({ ...ok, shorten: [{ match: '', replace: '' }] }), /match/);
  for (const bad of ['(\\w+\\s?)+$', '(a*)*', '(x+){2,}']) assert.throws(() => validateConfig({ ...ok, shorten: [{ match: bad, replace: '', regex: true }] }), /freeze/, bad);
  assert.doesNotThrow(() => validateConfig({ ...ok, shorten: [{ match: 'Work: (\\w+)', replace: '', regex: true }, { match: '\\s*\\(\\d\\d:\\d\\d-.*\\)', replace: '', regex: true }] }));
  assert.deepEqual(validateConfig({ ...ok, layout: { preset: 'top' } }).layout.widgets.slice(0, 2), ['clock', 'weather']);
  assert.throws(() => validateConfig({ ...ok, weeks: 0 }), /weeks/);
  assert.throws(() => validateConfig({ ...ok, location: {} }), /location/);
  assert.throws(() => validateConfig({ ...ok, calendars: [cal, cal] }), /unique/);
  assert.throws(() => validateConfig({ ...ok, calendars: [{ ...cal, url: 'file:///etc/passwd' }] }), /url/);
});

test('default grid: 3 Monday-first weeks with the current week first, at month and year ends', () => {
  const week = (date) => buildWeeks([], date, { weeks: 3, weekStart: 'monday' });
  const w = week(now);
  assert.deepEqual([w.length, w[0].days[0].date, w[2].days[6].date], [3, '2026-11-23', '2026-12-13']);
  assert.deepEqual(w.map((x) => x.number), [48, 49, 50]);
  assert.equal(w[0].days[1].today, true);
  const sunday = week(new Date(2026, 10, 29, 23));
  assert.equal(sunday[0].days[6].today, true, 'Sunday stays in the current row');
  const newYear = week(new Date(2026, 11, 31));
  assert.deepEqual([newYear[0].days[0].date, newYear.map((x) => x.number)], ['2026-12-28', [53, 1, 2]]);
  assert.deepEqual(dayLetters('monday'), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
});
test('short times drop :00 and use a or p', () => {
  assert.deepEqual([new Date(2026, 0, 1, 18), new Date(2026, 0, 1, 12, 41), new Date(2026, 0, 1, 0, 5)].map((d) => timeLabel(d, 'short')), ['6p', '12:41p', '12:05a']);
  assert.equal(timeLabel(new Date(2026, 0, 1, 18), 'long'), '6:00pm');
});
test('shortening rules: plain text, patterns, per calendar, never empty', () => {
  const rules = compileRules([
    { match: 'Varsity Wrestling - ', replace: 'VW ' },
    { match: '\\s*\\(\\d\\d:\\d\\d-.*\\)', replace: '', regex: true },
    { match: 'Work: (\\w+)', replace: 'Shift $1', regex: true, calendar: 'Work' },
    { match: 'cost $5', replace: '$&' },
    { match: 'Everything', replace: '' },
  ]);
  assert.equal(shorten('varsity wrestling - Dual @ North', 'Team', rules), 'VW Dual @ North');
  assert.equal(shorten('Work: 7a12 (07:00-19:30 CST)', 'Work', rules), 'Shift 7a12');
  assert.equal(shorten('Work: 7a12 (07:00-19:30 CST)', 'Other', rules), 'Work: 7a12');
  assert.equal(shorten('Lunch cost $5 each', 'x', rules), 'Lunch $& each', 'plain replacements are literal');
  assert.equal(shorten('Everything', 'x', rules), 'Everything');
});
