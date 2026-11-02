export function isSourceDue(lastRunAt: Date | null, scheduleMinutes: number, now = new Date()) {
  if (!lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() >= scheduleMinutes * 60_000;
}
