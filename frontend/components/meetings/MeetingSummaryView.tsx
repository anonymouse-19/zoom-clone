/**
 * The post-meeting summary (Teams-style recap): how long the meeting ran, who attended
 * and when (every join → leave, including rejoins), and the chat, downloadable as .txt.
 *
 * Shown on /room/{code}/ended after leaving or when the host ends the meeting, and from
 * "View summary" on a past meeting's details page.
 */

"use client";

import { Download } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { ErrorMessage, Skeleton } from "@/components/ui/Feedback";
import { useCurrentUser, useMeetingSummary } from "@/hooks/queries";
import type { Attendee, MeetingSummary } from "@/lib/api";
import { formatDuration, formatFullDate, formatTime } from "@/lib/format";
import { downloadBlob } from "@/lib/download";
import { buildTranscript } from "@/lib/transcript";

const HEADINGS = {
  left: "You left the meeting",
  ended: "The meeting has ended",
  none: "Meeting summary",
};

type MeetingSummaryViewProps = {
  meetingCode: string;
  /** Why we're here: decides the heading. */
  reason: keyof typeof HEADINGS;
};

export function MeetingSummaryView({ meetingCode, reason }: MeetingSummaryViewProps) {
  const { data: user } = useCurrentUser();
  const summaryQuery = useMeetingSummary(meetingCode);

  if (summaryQuery.isLoading || user === undefined) {
    return <Skeleton className="h-96" />;
  }
  if (summaryQuery.error || summaryQuery.data === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">{HEADINGS[reason]}</h1>
        <ErrorMessage message={summaryQuery.error?.message ?? "The summary isn't available"} />
        <ReturnHomeLink />
      </div>
    );
  }
  return <SummaryContent summary={summaryQuery.data} reason={reason} timeZone={user.timezone} />;
}

type SummaryContentProps = {
  summary: MeetingSummary;
  reason: keyof typeof HEADINGS;
  timeZone: string;
};

function SummaryContent({ summary, reason, timeZone }: SummaryContentProps) {
  const isStillRunning = summary.ended_at === null;

  function downloadTranscript() {
    const transcript = buildTranscript(summary, timeZone);
    const file = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    downloadBlob(`chat-${summary.meeting_code}.txt`, file);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{HEADINGS[reason]}</h1>
        <p className="text-ink-muted">
          {summary.title} · ID {summary.formatted_code} · Hosted by {summary.host_name}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-4 rounded-xl border border-line p-4 text-center">
        <SummaryStat label="Date" value={formatFullDate(summary.started_at, timeZone)} />
        <SummaryStat
          label={isStillRunning ? "Running for" : "Duration"}
          value={formatDuration(summary.duration_minutes)}
        />
        <SummaryStat label="Attendees" value={String(summary.attendees.length)} />
      </dl>

      <section aria-labelledby="attendance-heading">
        <h2 id="attendance-heading" className="mb-3 text-lg font-semibold">
          Attendance
        </h2>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {summary.attendees.map((attendee) => (
            <AttendeeRow
              key={`${attendee.display_name}-${attendee.sessions[0]?.joined_at}`}
              attendee={attendee}
              timeZone={timeZone}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="chat-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="chat-heading" className="text-lg font-semibold">
            Chat ({summary.messages.length})
          </h2>
          {summary.messages.length > 0 && (
            <Button size="sm" variant="secondary" onClick={downloadTranscript}>
              <Download size={14} aria-hidden /> Download transcript (.txt)
            </Button>
          )}
        </div>
        {summary.messages.length === 0 ? (
          <p className="text-sm text-ink-muted">No messages were sent in this meeting.</p>
        ) : (
          <ol className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-xl border border-line p-4">
            {summary.messages.map((message) => (
              <li key={message.id} className="text-sm">
                <span className="text-ink-muted">
                  [{formatTime(message.sent_at, timeZone)}] {message.sender_name} to{" "}
                  {message.recipient_name ?? "Everyone"}
                  {message.recipient_name !== null && " (privately)"}:
                </span>{" "}
                {message.body}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <ReturnHomeLink />
        {isStillRunning && (
          <Link
            href={`/j/${summary.meeting_code}`}
            className="rounded-full border border-line px-5 py-2 text-sm font-semibold hover:bg-canvas"
          >
            Rejoin
          </Link>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function AttendeeRow({ attendee, timeZone }: { attendee: Attendee; timeZone: string }) {
  let role = "";
  if (attendee.role === "host") {
    role = "Host";
  } else if (attendee.is_guest) {
    role = "Guest";
  }
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
      <span className="font-medium">
        {attendee.display_name}
        {role && <span className="ml-2 text-xs text-ink-muted">{role}</span>}
      </span>
      <span className="text-ink-muted">
        {attendee.sessions
          .map((session) => {
            const leftAt = session.left_at === null ? "now" : formatTime(session.left_at, timeZone);
            return `${formatTime(session.joined_at, timeZone)} – ${leftAt}`;
          })
          .join(", ")}{" "}
        · {formatDuration(attendee.total_minutes)}
      </span>
    </li>
  );
}

function ReturnHomeLink() {
  return (
    <Link
      href="/"
      className="rounded-full bg-zoom-blue px-5 py-2 text-sm font-semibold text-white hover:bg-zoom-blue-hover"
    >
      Return home
    </Link>
  );
}
