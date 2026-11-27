// Shortening rules: make event titles fit a wall calendar cell.

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compiles config.shorten once; plain rules match literally, ignoring case. */
export function compileRules(rules) {
  return rules.map((r) => ({
    calendar: r.calendar,
    re: new RegExp(r.regex ? r.match : escapeRegex(r.match), 'gi'),
    // Plain rules insert the replacement as written; patterns may use $1.
    replace: r.regex ? r.replace : () => r.replace,
  }));
}

// Titles are short in practice; capping them bounds how long any pattern can run.
const MAX_TITLE = 300;

/** Applies every matching rule in order. An empty result keeps the original title. */
export function shorten(title, calendar, compiled) {
  const short = compiled
    .filter((r) => !r.calendar || r.calendar === calendar)
    .reduce((text, r) => text.replace(r.re, r.replace), title.slice(0, MAX_TITLE))
    .replace(/\s{2,}/g, ' ')
    .trim();
  return short || title;
}
