/**
 * Display formatting for times, dates and durations.
 *
 * Called by: dashboard and meetings components.
 * The backend sends every time in UTC. These helpers convert to the *user's* timezone
 * (from GET /api/me), not the browser's, so the app shows the same times as the user's
 * Zoom profile, wherever the laptop happens to be.
 */

import { formatInTimeZone } from "date-fns-tz";

const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

// date-fns format patterns, named so call sites read clearly.
const TIME_PATTERN = "h:mm a"; // "9:30 AM"
const CALENDAR_DAY_PATTERN = "yyyy-MM-dd"; // only used to compare days
const SHORT_DAY_PATTERN = "EEE, MMM d"; // "Thu, Oct 8"
const LONG_DATE_PATTERN = "EEEE, MMMM d"; // "Tuesday, October 6"
const FULL_DATE_PATTERN = "MMM d, yyyy"; // "Oct 6, 2026"

type DateInput = string | Date;

/** "9:30 AM" in the given timezone. */
export function formatTime(moment: DateInput, timeZone: string): string {
  return formatInTimeZone(moment, timeZone, TIME_PATTERN);
}

/** "9:30 AM - 9:45 AM" for a meeting starting at `start` and lasting `durationMinutes`. */
export function formatTimeRange(start: string, durationMinutes: number, timeZone: string): string {
  const end = new Date(new Date(start).getTime() + durationMinutes * MS_PER_MINUTE);
  return `${formatTime(start, timeZone)} - ${formatTime(end, timeZone)}`;
}

/** "Tuesday, October 6": the clock card's date line. */
export function formatLongDate(moment: DateInput, timeZone: string): string {
  return formatInTimeZone(moment, timeZone, LONG_DATE_PATTERN);
}

/** "Oct 6, 2026": used in recent meeting rows. */
export function formatFullDate(moment: DateInput, timeZone: string): string {
  return formatInTimeZone(moment, timeZone, FULL_DATE_PATTERN);
}

/**
 * The calendar day of `moment` in `timeZone`, as "2026-10-06".
 * INTERVIEW: compare days in the user's timezone, never in UTC.
 * Comparing these strings is the simplest correct way to ask "same day?" in a
 * timezone: 11 PM on the 6th in India is still the 6th, even though it's the 7th in UTC.
 */
export function calendarDayKey(moment: DateInput, timeZone: string): string {
  return formatInTimeZone(moment, timeZone, CALENDAR_DAY_PATTERN);
}

/** "Today", "Tomorrow", or "Thu, Oct 8", the way Zoom labels its meeting groups. */
export function dayLabel(moment: DateInput, timeZone: string, now: Date): string {
  const day = calendarDayKey(moment, timeZone);
  if (day === calendarDayKey(now, timeZone)) {
    return "Today";
  }
  const tomorrow = new Date(now.getTime() + MS_PER_DAY);
  if (day === calendarDayKey(tomorrow, timeZone)) {
    return "Tomorrow";
  }
  return formatInTimeZone(moment, timeZone, SHORT_DAY_PATTERN);
}

export type DayGroup<T> = { label: string; items: T[] };

/**
 * Group meetings (already sorted by start time) under day headings, keeping order.
 * Meetings without a start time are skipped: only scheduled meetings are grouped by day.
 */
export function groupByDay<T extends { start_time: string | null }>(
  meetings: T[],
  timeZone: string,
  now: Date,
): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const meeting of meetings) {
    if (meeting.start_time === null) {
      continue;
    }
    const label = dayLabel(meeting.start_time, timeZone, now);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.items.push(meeting);
    } else {
      groups.push({ label, items: [meeting] });
    }
  }
  return groups;
}

/** "45 min", "1 hr", "1 hr 15 min". */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours === 0) {
    return `${minutes} min`;
  }
  if (minutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${minutes} min`;
}

/** Whole minutes from `now` until `moment` (negative if it's in the past). */
export function minutesUntil(moment: string, now: Date): number {
  return Math.round((new Date(moment).getTime() - now.getTime()) / MS_PER_MINUTE);
}
