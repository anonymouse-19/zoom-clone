/**
 * "Waiting for the host to start this meeting": shown after a guest presses Join on a
 * meeting that hasn't started. The pre-join screen keeps polling, and joins on its own
 * the moment the host starts. Zoom shows exactly this screen.
 */

import { Button } from "@/components/ui/Button";
import { formatLongDate, formatTime } from "@/lib/format";

type WaitingForHostProps = {
  meetingTitle: string;
  /** The scheduled start (ISO string), or null for meetings with no planned time. */
  startTime: string | null;
  /** The viewer's timezone (their account's, or the browser's for guests). */
  timeZone: string;
  onCancel: () => void;
};

export function WaitingForHost({
  meetingTitle,
  startTime,
  timeZone,
  onCancel,
}: WaitingForHostProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center" role="status">
      <span className="relative flex h-4 w-4" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zoom-blue opacity-60" />
        <span className="relative inline-flex h-4 w-4 rounded-full bg-zoom-blue" />
      </span>
      <div>
        <h2 className="text-lg font-semibold">Waiting for the host to start this meeting</h2>
        <p className="mt-1 text-sm font-medium">{meetingTitle}</p>
        {startTime && (
          <p className="mt-1 text-sm text-ink-muted">
            Scheduled for {formatLongDate(startTime, timeZone)}, {formatTime(startTime, timeZone)}
          </p>
        )}
        <p className="mt-3 text-sm text-ink-muted">
          You&apos;ll join automatically as soon as the host starts. You can check your camera and
          microphone while you wait.
        </p>
      </div>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
