/**
 * Invite-link entry ("/j/12345678901?tk=..."): the pre-join screen.
 *
 * Reads the meeting code from the path and the rest from the query string:
 *   tk    = invite token (lets you skip the passcode)
 *   pwd   = passcode (Zoom-style links)
 *   name, audio=off, video=off, share=1 = choices made on the Join page
 */

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";

import { MinimalHeader } from "@/components/layout/MinimalHeader";
import { PrejoinScreen } from "@/components/prejoin/PrejoinScreen";
import { Skeleton } from "@/components/ui/Feedback";

export default function InviteLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return (
    <div className="min-h-screen bg-canvas">
      <MinimalHeader />
      {/* useSearchParams needs a Suspense boundary (the URL isn't known at build time). */}
      <Suspense fallback={<Skeleton className="m-8 h-96" />}>
        <PrejoinFromUrl meetingCode={code} />
      </Suspense>
    </div>
  );
}

function PrejoinFromUrl({ meetingCode }: { meetingCode: string }) {
  const query = useSearchParams();
  return (
    <PrejoinScreen
      meetingCode={meetingCode}
      inviteToken={query.get("tk")}
      linkPasscode={query.get("pwd")}
      initialName={query.get("name")}
      startMuted={query.get("audio") === "off"}
      startWithVideoOff={query.get("video") === "off"}
      shareAfterJoin={query.get("share") === "1"}
    />
  );
}
