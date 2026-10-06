/**
 * "/schedule": Schedule a meeting. "/schedule?edit=12345678901": edit that meeting
 * (same form, pre-filled, saving with PATCH).
 */

"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ScheduleForm } from "@/components/schedule/ScheduleForm";
import { ErrorMessage, Skeleton } from "@/components/ui/Feedback";
import { useCurrentUser, useMeeting } from "@/hooks/queries";

export default function SchedulePage() {
  // useSearchParams needs a Suspense boundary (the URL isn't known at build time).
  return (
    <Suspense fallback={<Skeleton className="m-8 h-96" />}>
      <SchedulePageContent />
    </Suspense>
  );
}

function SchedulePageContent() {
  const editCode = useSearchParams().get("edit");
  const { data: user } = useCurrentUser();
  const editing = useMeeting(editCode ?? "", editCode !== null);

  function renderForm() {
    if (!user || editing.isLoading) {
      return <Skeleton className="h-96" />;
    }
    if (editCode !== null && !editing.data) {
      return <ErrorMessage message={editing.error?.message ?? "Couldn't load this meeting"} />;
    }
    // `key` makes React build a fresh form when switching between new/edit modes.
    return (
      <ScheduleForm key={editCode ?? "new"} user={user} editingMeeting={editing.data ?? null} />
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
      <h1 className="mb-2 text-2xl font-semibold">
        {editCode ? "Edit Meeting" : "Schedule Meeting"}
      </h1>
      {renderForm()}
    </div>
  );
}
