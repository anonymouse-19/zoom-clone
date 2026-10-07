/**
 * The Schedule Meeting form (also the Edit form), laid out like Zoom's: Topic, When,
 * Duration, Time zone, Recurring, Meeting ID, Security, Video, Options, Invitees.
 *
 * Save:
 *   Step 1: validate in the browser (instant feedback next to each field).
 *   Step 2: POST /api/meetings (new) or PATCH /api/meetings/{code} (edit). The server
 *           validates again and is the final word.
 *   Step 3: new → show the "Meeting scheduled" dialog; edit → back to the details page.
 *
 * Logic (defaults, validation, time conversion) lives in lib/schedule.ts; this file is
 * the form's layout and wiring.
 */

"use client";

import { formatInTimeZone } from "date-fns-tz";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { useScheduleMeeting, useUpdateMeeting } from "@/hooks/queries";
import type { MeetingDetail, Recurrence, User } from "@/lib/api";
import { formatMeetingCode } from "@/lib/meetingCode";
import {
  TIME_SLOTS,
  defaultScheduleValues,
  timeZoneOptions,
  toScheduleInput,
  validateSchedule,
  valuesFromMeeting,
  type ScheduleFormErrors,
  type ScheduleFormValues,
} from "@/lib/schedule";

import { InviteesInput } from "./InviteesInput";
import { MeetingScheduledDialog } from "./MeetingScheduledDialog";

const HOUR_CHOICES = Array.from({ length: 25 }, (_, hours) => hours); // 0–24
const MINUTE_CHOICES = [0, 15, 30, 45];

const INPUT_CLASSES =
  "h-10 rounded-lg border border-line bg-white px-3 text-sm focus:border-zoom-blue focus:outline-none";

type ScheduleFormProps = {
  user: User;
  /** The meeting being edited, or null when scheduling a new one. */
  editingMeeting: MeetingDetail | null;
};

export function ScheduleForm({ user, editingMeeting }: ScheduleFormProps) {
  const router = useRouter();
  const scheduleMutation = useScheduleMeeting();
  const updateMutation = useUpdateMeeting();
  // Lazy initial values: computed once, when the form first appears.
  const [values, setValues] = useState<ScheduleFormValues>(() =>
    editingMeeting ? valuesFromMeeting(editingMeeting) : defaultScheduleValues(user, new Date()),
  );
  const [errors, setErrors] = useState<ScheduleFormErrors>({});
  const [scheduledMeeting, setScheduledMeeting] = useState<MeetingDetail | null>(null);
  const [timeZones] = useState(() => timeZoneOptions(new Date(), [user.timezone, values.timezone]));

  const isSaving = scheduleMutation.isPending || updateMutation.isPending;
  let saveLabel = editingMeeting ? "Save changes" : "Save";
  if (isSaving) {
    saveLabel = "Saving…";
  }
  const today = formatInTimeZone(new Date(), values.timezone, "yyyy-MM-dd");

  /** Change one field of the form. */
  function update<Key extends keyof ScheduleFormValues>(key: Key, value: ScheduleFormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const foundErrors = validateSchedule(values, new Date());
    setErrors(foundErrors);
    if (Object.keys(foundErrors).length > 0) {
      return;
    }
    try {
      if (editingMeeting) {
        const meetingCode = editingMeeting.meeting_code;
        await updateMutation.mutateAsync({ meetingCode, changes: toScheduleInput(values) });
        toast.success("Meeting updated");
        router.push(`/meetings/${meetingCode}`);
      } else {
        const meeting = await scheduleMutation.mutateAsync(toScheduleInput(values));
        toast.success("Meeting scheduled");
        setScheduledMeeting(meeting);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the meeting");
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="divide-y divide-line">
        <FormRow label="Topic" htmlFor="topic" error={errors.title}>
          <input
            id="topic"
            value={values.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder={`${user.name}'s Zoom Meeting`}
            maxLength={200}
            className={INPUT_CLASSES}
          />
        </FormRow>

        <FormRow label="Description" htmlFor="description">
          <textarea
            id="description"
            value={values.description}
            onChange={(event) => update("description", event.target.value)}
            placeholder="Add description (optional)"
            rows={3}
            className="rounded-lg border border-line px-3 py-2 text-sm focus:border-zoom-blue focus:outline-none"
          />
        </FormRow>

        <FormRow label="When" htmlFor="date" error={errors.date}>
          <div className="flex flex-wrap gap-2">
            <input
              id="date"
              type="date"
              value={values.date}
              min={today}
              onChange={(event) => update("date", event.target.value)}
              className={INPUT_CLASSES}
            />
            <select
              aria-label="Start time"
              value={values.time}
              onChange={(event) => update("time", event.target.value)}
              className={INPUT_CLASSES}
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot.value} value={slot.value}>
                  {slot.label}
                </option>
              ))}
            </select>
          </div>
        </FormRow>

        <FormRow label="Duration" error={errors.durationMinutes}>
          <div className="flex items-center gap-2 text-sm">
            <select
              aria-label="Duration hours"
              value={values.durationHours}
              onChange={(event) => update("durationHours", Number(event.target.value))}
              className={INPUT_CLASSES}
            >
              {HOUR_CHOICES.map((hours) => (
                <option key={hours} value={hours}>
                  {hours}
                </option>
              ))}
            </select>
            hr
            <select
              aria-label="Duration minutes"
              value={values.durationMinutes}
              onChange={(event) => update("durationMinutes", Number(event.target.value))}
              className={INPUT_CLASSES}
            >
              {MINUTE_CHOICES.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes}
                </option>
              ))}
            </select>
            min
          </div>
        </FormRow>

        <FormRow label="Time zone" htmlFor="timezone">
          <select
            id="timezone"
            value={values.timezone}
            onChange={(event) => update("timezone", event.target.value)}
            className={`${INPUT_CLASSES} w-full max-w-md`}
          >
            {timeZones.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {zone.label}
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Recurring">
          <RecurrenceField
            value={values.recurrence}
            onChange={(recurrence) => update("recurrence", recurrence)}
          />
        </FormRow>

        <FormRow label="Meeting ID">
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="sr-only">Meeting ID</legend>
            <label className="flex items-center gap-2">
              <input type="radio" checked readOnly className="accent-zoom-blue" />
              Generate automatically
            </label>
            <label className="flex items-center gap-2 text-ink-muted">
              <input type="radio" disabled className="accent-zoom-blue" />
              Personal Meeting ID {formatMeetingCode(user.personal_meeting_id)}
            </label>
            <p className="text-xs text-ink-muted">
              Your Personal Meeting ID is for instant meetings: use &ldquo;Use my PMI&rdquo; in the
              New meeting menu, or the Personal Room tab.
            </p>
          </fieldset>
        </FormRow>

        <FormRow label="Security" htmlFor="passcode" error={errors.passcode}>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span>Passcode</span>
              <input
                id="passcode"
                value={values.passcode}
                onChange={(event) => update("passcode", event.target.value)}
                maxLength={10}
                className={`${INPUT_CLASSES} w-36 font-mono`}
              />
            </div>
            <p className="text-xs text-ink-muted">
              Only people with the invite link or this passcode can join.
            </p>
            <CheckboxField
              label="Waiting room"
              description="Only people you admit can join."
              isChecked={values.isWaitingRoomOn}
              onChange={(isChecked) => update("isWaitingRoomOn", isChecked)}
            />
          </div>
        </FormRow>

        <FormRow label="Video">
          <div className="flex flex-col gap-2 text-sm">
            <OnOffRadios
              label="Host"
              name="host-video"
              isOn={values.isHostVideoOn}
              onChange={(isOn) => update("isHostVideoOn", isOn)}
            />
            <OnOffRadios
              label="Participant"
              name="participant-video"
              isOn={values.isParticipantVideoOn}
              onChange={(isOn) => update("isParticipantVideoOn", isOn)}
            />
          </div>
        </FormRow>

        <FormRow label="Options">
          <div className="flex flex-col gap-3">
            <CheckboxField
              label="Mute participants upon entry"
              isChecked={values.isMuteOnEntryOn}
              onChange={(isChecked) => update("isMuteOnEntryOn", isChecked)}
            />
            <CheckboxField
              label="Allow participants to join before host"
              description={
                values.isWaitingRoomOn
                  ? "Not available with a waiting room: people wait for you to admit them."
                  : "Participants can meet without you; the meeting starts when the first one joins."
              }
              isChecked={values.isJoinBeforeHostOn && !values.isWaitingRoomOn}
              isDisabled={values.isWaitingRoomOn}
              onChange={(isChecked) => update("isJoinBeforeHostOn", isChecked)}
            />
          </div>
        </FormRow>

        <FormRow label="Invitees">
          <InviteesInput
            emails={values.invitees}
            onChange={(invitees) => update("invitees", invitees)}
          />
        </FormRow>

        <div className="flex justify-end gap-2 py-6">
          <Button variant="secondary" onClick={() => router.back()} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSaving}>
            {saveLabel}
          </Button>
        </div>
      </form>

      <MeetingScheduledDialog
        meeting={scheduledMeeting}
        onDone={() => {
          const meetingCode = scheduledMeeting?.meeting_code;
          setScheduledMeeting(null);
          router.push(meetingCode ? `/meetings/${meetingCode}` : "/meetings");
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Small layout helpers used by the form above
// ---------------------------------------------------------------------------

type FormRowProps = {
  label: string;
  /** The id of the single control this label describes (omit for groups). */
  htmlFor?: string;
  error?: string;
  children: ReactNode;
};

/** One row: the label on the left (on top on phones), the control and its error on the right. */
function FormRow({ label, htmlFor, error, children }: FormRowProps) {
  const labelClasses = "pt-2 text-sm font-semibold";
  return (
    <div className="grid gap-2 py-4 md:grid-cols-[160px_1fr] md:gap-6">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={labelClasses}>
          {label}
        </label>
      ) : (
        <span className={labelClasses}>{label}</span>
      )}
      <div className="flex flex-col gap-1">
        {children}
        {error && (
          <p role="alert" className="text-xs text-zoom-red">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

type CheckboxFieldProps = {
  label: string;
  description?: string;
  isChecked: boolean;
  isDisabled?: boolean;
  onChange: (isChecked: boolean) => void;
};

function CheckboxField({
  label,
  description,
  isChecked,
  isDisabled = false,
  onChange,
}: CheckboxFieldProps) {
  return (
    <label className={`flex items-start gap-2 text-sm ${isDisabled ? "opacity-60" : ""}`}>
      <input
        type="checkbox"
        checked={isChecked}
        disabled={isDisabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-zoom-blue"
      />
      <span>
        {label}
        {description && <span className="block text-xs text-ink-muted">{description}</span>}
      </span>
    </label>
  );
}

type OnOffRadiosProps = {
  label: string;
  name: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
};

/** "Host: (•) On ( ) Off", Zoom's video settings. */
function OnOffRadios({ label, name, isOn, onChange }: OnOffRadiosProps) {
  return (
    <fieldset className="flex items-center gap-4">
      <legend className="float-left w-24">{label}</legend>
      <label className="flex items-center gap-1.5">
        <input
          type="radio"
          name={name}
          checked={isOn}
          onChange={() => onChange(true)}
          className="accent-zoom-blue"
        />
        On
      </label>
      <label className="flex items-center gap-1.5">
        <input
          type="radio"
          name={name}
          checked={!isOn}
          onChange={() => onChange(false)}
          className="accent-zoom-blue"
        />
        Off
      </label>
    </fieldset>
  );
}

/** "[ ] Recurring meeting", and when ticked, how often. */
function RecurrenceField({
  value,
  onChange,
}: {
  value: Recurrence;
  onChange: (recurrence: Recurrence) => void;
}) {
  const isRecurring = value !== "none";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <CheckboxField
        label="Recurring meeting"
        isChecked={isRecurring}
        onChange={(isChecked) => onChange(isChecked ? "weekly" : "none")}
      />
      {isRecurring && (
        <select
          aria-label="Repeats"
          value={value}
          onChange={(event) => onChange(event.target.value as Recurrence)}
          className={INPUT_CLASSES}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      )}
    </div>
  );
}
