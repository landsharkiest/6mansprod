/** Today's date in UTC as YYYY-MM-DD. Daily challenges roll over at 00:00 UTC. */
export function utcToday(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** YYYY-MM-DD for the UTC day before `day`. */
export function previousDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
