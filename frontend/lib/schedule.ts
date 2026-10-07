/**
 * The Schedule form's logic, kept out of the component so it reads on its own:
 * default values, filling the form from an existing meeting, validation, and turning the
 * form into the API request.
 *
 * Times: the form holds a *wall-clock* date and time ("2026-10-08", "09:30") plus a
 * timezone, exactly what the user picked. Only when saving do we turn that into one UTC
 * instant (fromZonedTime). That way "9:30 AM in Asia/Kolkata" means the same thing no
 * matter where the browser is.
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import type { MeetingDetail, Recurrence, ScheduleMeetingInput, User } from "@/lib/api";

export type ScheduleFormValues = {
  title: string;
  description: string;
  date: string; // "2026-10-08", in `timezone`
  time: string; // "09:30" (24-hour), in `timezone`
  durationHours: number;
  durationMinutes: number;
  timezone: string;
  recurrence: Recurrence;
  passcode: string;
  isHostVideoOn: boolean;
  isParticipantVideoOn: boolean;
  isWaitingRoomOn: boolean;
  isMuteOnEntryOn: boolean;
  isJoinBeforeHostOn: boolean;
  invitees: string[];
};

export type ScheduleFormErrors = Partial<Record<keyof ScheduleFormValues, string>>;

const MINUTES_PER_HOUR = 60;
const SLOT_MINUTES = 15; // the time picker's step, like Zoom's
const HALF_HOUR_MS = 30 * 60_000;
const MAX_DURATION_MINUTES = 24 * MINUTES_PER_HOUR; // same cap as the server
const MAX_TITLE_LENGTH = 200;
const PAST_GRACE_MS = 60_000; // the server allows the same 1-minute grace
const PASSCODE_PATTERN = /^[A-Za-z0-9]{1,10}$/;
const PASSCODE_LENGTH = 6;
const PASSCODE_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Every 15-minute slot of a day: { value: "09:30", label: "9:30 AM" }. */
export const TIME_SLOTS: { value: string; label: string }[] = Array.from(
  { length: (24 * MINUTES_PER_HOUR) / SLOT_MINUTES },
  (_, index) => {
    const totalMinutes = index * SLOT_MINUTES;
    const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    const minutes = totalMinutes % MINUTES_PER_HOUR;
    const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    const label = `${hour12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
    return { value, label };
  },
);

/**
 * A random 6-character passcode to pre-fill the form (editable). Uses the browser's
 * cryptographic random generator. Look-alike characters (0/O, 1/l/I) are left out, so
 * it's easy to read aloud.
 */
export function generatePasscode(): string {
  const randomValues = crypto.getRandomValues(new Uint32Array(PASSCODE_LENGTH));
  return Array.from(
    randomValues,
    (value) => PASSCODE_ALPHABET[value % PASSCODE_ALPHABET.length],
  ).join("");
}

/** A new meeting: the next half hour, 1 hour long, in the user's timezone. */
export function defaultScheduleValues(user: User, now: Date): ScheduleFormValues {
  const nextHalfHour = new Date(Math.ceil((now.getTime() + 1) / HALF_HOUR_MS) * HALF_HOUR_MS);
  return {
    title: "",
    description: "",
    date: formatInTimeZone(nextHalfHour, user.timezone, "yyyy-MM-dd"),
    time: formatInTimeZone(nextHalfHour, user.timezone, "HH:mm"),
    durationHours: 1,
    durationMinutes: 0,
    timezone: user.timezone,
    recurrence: "none",
    passcode: generatePasscode(),
    isHostVideoOn: true,
    isParticipantVideoOn: true,
    isWaitingRoomOn: false,
    isMuteOnEntryOn: false,
    isJoinBeforeHostOn: false,
    invitees: [],
  };
}

/** Edit mode: the form filled from an existing meeting, shown in the meeting's timezone. */
export function valuesFromMeeting(meeting: MeetingDetail): ScheduleFormValues {
  const start = meeting.start_time ?? new Date().toISOString();
  return {
    title: meeting.title,
    description: meeting.description,
    date: formatInTimeZone(start, meeting.timezone, "yyyy-MM-dd"),
    time: formatInTimeZone(start, meeting.timezone, "HH:mm"),
    durationHours: Math.floor(meeting.duration_minutes / MINUTES_PER_HOUR),
    durationMinutes: meeting.duration_minutes % MINUTES_PER_HOUR,
    timezone: meeting.timezone,
    recurrence: meeting.recurrence,
    passcode: meeting.passcode,
    isHostVideoOn: meeting.settings.video_on_entry_host,
    isParticipantVideoOn: meeting.settings.video_on_entry_participant,
    isWaitingRoomOn: meeting.settings.waiting_room_enabled,
    isMuteOnEntryOn: meeting.settings.mute_on_entry,
    isJoinBeforeHostOn: meeting.settings.allow_join_before_host,
    invitees: meeting.invitees.map((invitee) => invitee.email),
  };
}

/** The wall-clock date + time, read in the chosen timezone, as one exact instant. */
export function startInstant(values: ScheduleFormValues): Date {
  return fromZonedTime(`${values.date}T${values.time}:00`, values.timezone);
}

export function totalDurationMinutes(values: ScheduleFormValues): number {
  return values.durationHours * MINUTES_PER_HOUR + values.durationMinutes;
}

/**
 * Check the form before sending. The server checks the same rules again; this copy
 * exists so mistakes show up instantly, next to the field.
 */
export function validateSchedule(values: ScheduleFormValues, now: Date): ScheduleFormErrors {
  const errors: ScheduleFormErrors = {};
  if (values.title.length > MAX_TITLE_LENGTH) {
    errors.title = `Keep the topic under ${MAX_TITLE_LENGTH} characters`;
  }
  if (!values.date || !values.time) {
    errors.date = "Pick a date and time";
  } else if (startInstant(values).getTime() < now.getTime() - PAST_GRACE_MS) {
    errors.date = "Start time can't be in the past";
  }
  const duration = totalDurationMinutes(values);
  if (duration <= 0) {
    errors.durationMinutes = "Duration must be more than 0 minutes";
  } else if (duration > MAX_DURATION_MINUTES) {
    errors.durationMinutes = "A meeting can last at most 24 hours";
  }
  if (!PASSCODE_PATTERN.test(values.passcode)) {
    errors.passcode = "Use 1–10 letters or numbers";
  }
  return errors;
}

/**
 * The form as a request body. Used for POST /api/meetings, and also for PATCH when
 * editing: sending every field is simpler than tracking which ones changed, and the
 * server applies them all the same way.
 */
export function toScheduleInput(values: ScheduleFormValues): ScheduleMeetingInput {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    start_time: startInstant(values).toISOString(),
    duration_minutes: totalDurationMinutes(values),
    timezone: values.timezone,
    recurrence: values.recurrence,
    passcode: values.passcode,
    settings: {
      video_on_entry_host: values.isHostVideoOn,
      video_on_entry_participant: values.isParticipantVideoOn,
      waiting_room_enabled: values.isWaitingRoomOn,
      mute_on_entry: values.isMuteOnEntryOn,
      // A waiting room overrides "join before host" (the server applies the same rule).
      allow_join_before_host: values.isJoinBeforeHostOn && !values.isWaitingRoomOn,
    },
    invitees: values.invitees,
  };
}

/**
 * Time zone choices like "(GMT+05:30) Asia/Kolkata", sorted by offset.
 *
 * Browsers list each zone under one canonical name, which can be an older spelling
 * (Chrome lists "Asia/Calcutta", not "Asia/Kolkata"). The user's own zone is added if
 * it's missing, so the select can always show it.
 */
export function timeZoneOptions(
  now: Date,
  mustInclude: string[],
): { value: string; label: string }[] {
  const zones = new Set(Intl.supportedValuesOf("timeZone"));
  for (const zone of mustInclude) {
    zones.add(zone);
  }
  return Array.from(zones)
    .map((zone) => ({ zone, offset: formatInTimeZone(now, zone, "xxx") }))
    .sort((a, b) => {
      const byOffset = offsetMinutes(a.offset) - offsetMinutes(b.offset);
      return byOffset !== 0 ? byOffset : a.zone.localeCompare(b.zone);
    })
    .map(({ zone, offset }) => ({
      value: zone,
      label: `(GMT${offset}) ${zone.replaceAll("_", " ")}`,
    }));
}

/** "+05:30" → 330, "-08:00" → -480. */
function offsetMinutes(offset: string): number {
  const sign = offset.startsWith("-") ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(":").map(Number);
  return sign * (hours * MINUTES_PER_HOUR + minutes);
}
