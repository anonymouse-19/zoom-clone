/**
 * Meeting details page ("/meetings/12345678901").
 *
 * Next.js passes dynamic URL segments as `params`, a Promise in Next 15+. A client page
 * unwraps it with React's `use()`.
 */

"use client";

import { CalendarX } from "lucide-react";
import Link from "next/link";
import { use } from "react";

import { MeetingDetailsView } from "@/components/meetings/MeetingDetailsView";
import { EmptyState, ErrorMessage, Skeleton } from "@/components/ui/Feedback";
import { useCurrentUser, useMeeting } from "@/hooks/queries";
import { ApiError } from "@/lib/api";

const NOT_FOUND = 404;

export default function MeetingDetailsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const meeting = useMeeting(code);
  const { data: user } = useCurrentUser();

  if (meeting.isLoading || !user) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 md:px-8">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isMissing = meeting.error instanceof ApiError && meeting.error.status === NOT_FOUND;
  if (isMissing) {
    return (
      <EmptyState
        icon={<CalendarX size={36} aria-hidden />}
        title="This meeting doesn't exist"
        message="Check the meeting ID, or ask the host for a new invitation."
        action={
          <Link href="/meetings" className="text-sm font-semibold text-zoom-blue hover:underline">
            Back to Meetings
          </Link>
        }
      />
    );
  }
  if (meeting.error || !meeting.data) {
    return <ErrorMessage message={meeting.error?.message ?? "Couldn't load this meeting"} />;
  }

  return <MeetingDetailsView meeting={meeting.data} user={user} />;
}
