/**
 * All day math (grid, times, quiet hours, iCal floating times) uses the process time zone, so the board's
 * configured zone is applied there. Node re-reads TZ when it changes.
 */
export function applyTimeZone(config, env = process.env) {
  if (config.timeZone) env.TZ = config.timeZone;
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
