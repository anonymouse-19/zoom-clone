/**
 * The chat transcript as plain text, for "Download transcript" on the post-meeting
 * summary page (lib/download.ts does the downloading).
 */

import type { ChatMessage, MeetingSummary } from "@/lib/api";
import { formatFullDate, formatTime } from "@/lib/format";

/** "[2:05 PM] Sam to Everyone: Hello", one line per message, with a short heading. */
export function buildTranscript(summary: MeetingSummary, timeZone: string): string {
  const heading = [
    `Meeting: ${summary.title}`,
    `Meeting ID: ${summary.formatted_code}`,
    `Date: ${formatFullDate(summary.started_at, timeZone)}`,
    "",
  ];
  const lines = summary.messages.map((message) => transcriptLine(message, timeZone));
  return [...heading, ...lines].join("\n");
}

function transcriptLine(message: ChatMessage, timeZone: string): string {
  const to = message.recipient_name ?? "Everyone";
  const privately = message.recipient_name === null ? "" : " (privately)";
  return `[${formatTime(message.sent_at, timeZone)}] ${message.sender_name} to ${to}${privately}: ${message.body}`;
}
