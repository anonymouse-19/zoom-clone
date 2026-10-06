/**
 * "/join": Join a meeting by ID or link. "/join?share=1" (from the Home "Share screen"
 * tile) asks which meeting to share your screen into.
 */

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { JoinForm } from "@/components/join/JoinForm";
import { MinimalHeader } from "@/components/layout/MinimalHeader";
import { Skeleton } from "@/components/ui/Feedback";

export default function JoinPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <MinimalHeader />
      <main className="mx-auto mt-12 max-w-md px-4">
        <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">
          {/* useSearchParams needs a Suspense boundary (the URL isn't known at build time). */}
          <Suspense fallback={<Skeleton className="h-80" />}>
            <JoinPageContent />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function JoinPageContent() {
  const isSharingScreen = useSearchParams().get("share") === "1";
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold">
        {isSharingScreen ? "Share Screen" : "Join Meeting"}
      </h1>
      <p className="mb-6 text-sm text-ink-muted">
        {isSharingScreen
          ? "Enter the meeting you want to share your screen into."
          : "Enter a meeting ID, or paste an invite link."}
      </p>
      <JoinForm isSharingScreen={isSharingScreen} />
    </>
  );
}
