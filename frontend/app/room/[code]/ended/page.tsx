/**
 * "/room/{code}/ended": the post-meeting page. Reached after leaving (?reason=left),
 * when the host ends the meeting (?reason=ended), or from "View summary" on a past
 * meeting (no reason).
 */

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";

import { MinimalHeader } from "@/components/layout/MinimalHeader";
import { MeetingSummaryView } from "@/components/meetings/MeetingSummaryView";
import { Skeleton } from "@/components/ui/Feedback";

export default function MeetingEndedPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <div className="min-h-screen bg-white">
      <MinimalHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        {/* useSearchParams needs a Suspense boundary (the URL isn't known at build time). */}
        <Suspense fallback={<Skeleton className="h-96" />}>
          <SummaryForReason meetingCode={code} />
        </Suspense>
      </main>
    </div>
  );
}

function SummaryForReason({ meetingCode }: { meetingCode: string }) {
  const reasonParam = useSearchParams().get("reason");
  let reason: "left" | "ended" | "none" = "none";
  if (reasonParam === "left" || reasonParam === "ended") {
    reason = reasonParam;
  }
  return <MeetingSummaryView meetingCode={meetingCode} reason={reason} />;
}
