/**
 * Per-video approval window helpers (UI). Mirrors the SQL add_business_days()
 * so the brand's 5-working-day deadline reads the same on the client. Pure — no
 * React/Supabase.
 */

export const APPROVAL_WINDOW_BUSINESS_DAYS = 5;

/** Add N working days to a date, skipping Saturdays and Sundays. */
export function addBusinessDays(from: Date, n: number): Date {
  const d = new Date(from);
  let left = Math.max(n, 0);
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return d;
}

/** Working days remaining until a deadline (0 once it has passed). */
export function workingDaysLeft(
  deadlineISO?: string | null,
  from: Date = new Date()
): number | null {
  if (!deadlineISO) return null;
  const deadline = new Date(deadlineISO);
  if (Number.isNaN(deadline.getTime())) return null;
  if (deadline <= from) return 0;
  let count = 0;
  const cur = new Date(from);
  while (cur < deadline) {
    cur.setDate(cur.getDate() + 1);
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count += 1;
  }
  return count;
}

/** Friendly countdown label for a pending clip's approval deadline. */
export function approvalCountdownLabel(deadlineISO?: string | null): string {
  if (!deadlineISO) return "Pending review";
  const deadline = new Date(deadlineISO);
  if (Number.isNaN(deadline.getTime())) return "Pending review";
  const now = new Date();
  if (deadline <= now) return "Auto-approving…";
  const left = workingDaysLeft(deadlineISO, now);
  if (left == null || left <= 0) return "Due today";
  return `${left} working day${left === 1 ? "" : "s"} left`;
}
