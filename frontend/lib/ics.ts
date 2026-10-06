/**
 * "Add to calendar" links, with no OAuth or calendar API:
 * - the .ics file comes from the backend (see api.calendarFileUrl), and works with
 *   Outlook, Apple Calendar and others;
 * - Google Calendar gets a pre-filled "new event" URL, built here.
 */

import { formatInTimeZone } from "date-fns-tz";

import type { MeetingDetail } from "@/lib/api";

const MS_PER_MINUTE = 60_000;
// Google wants compact UTC times: 20261008T040000Z.
const GOOGLE_UTC_PATTERN = "yyyyMMdd'T'HHmmss'Z'";
const GOOGLE_CALENDAR_NEW_EVENT_URL = "https://calendar.google.com/calendar/render";

/** A link that opens Google Calendar with this meeting filled in. Null if it has no time. */
export function googleCalendarUrl(meeting: MeetingDetail): string | null {
  if (meeting.start_time === null) {
    return null;
  }
  const start = new Date(meeting.start_time);
  const end = new Date(start.getTime() + meeting.duration_minutes * MS_PER_MINUTE);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: meeting.title,
    dates: `${formatInTimeZone(start, "UTC", GOOGLE_UTC_PATTERN)}/${formatInTimeZone(end, "UTC", GOOGLE_UTC_PATTERN)}`,
    details: meeting.invitation,
    location: meeting.invite_link,
  });
  return `${GOOGLE_CALENDAR_NEW_EVENT_URL}?${params.toString()}`;
}
