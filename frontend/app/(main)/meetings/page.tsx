/**
 * Meetings page ("/meetings"): Upcoming | Previous | Personal Room tabs.
 * Upcoming rows the user hosts get Edit and Delete in their "…" menu; Delete asks
 * for confirmation first. The navbar search lands here as ?search=..., filtering by title.
 */

"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { RecentMeetingList, UpcomingMeetingList } from "@/components/home/MeetingList";
import { PersonalRoomPanel } from "@/components/meetings/PersonalRoomPanel";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DropdownDivider, DropdownItem } from "@/components/ui/Dropdown";
import { Skeleton } from "@/components/ui/Feedback";
import { Tabs } from "@/components/ui/Tabs";
import { useCancelMeeting, useCurrentUser, useMeetings } from "@/hooks/queries";
import { useNow } from "@/hooks/useNow";
import type { MeetingListItem } from "@/lib/api";

type MeetingsTab = "upcoming" | "previous" | "personal";

const MEETINGS_TABS: { id: MeetingsTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "previous", label: "Previous" },
  { id: "personal", label: "Personal Room" },
];

const ONE_MINUTE_MS = 60_000;

/** Case-insensitive title match for the navbar search. Empty search keeps everything. */
function matchesSearch(meeting: MeetingListItem, searchText: string): boolean {
  return meeting.title.toLowerCase().includes(searchText.toLowerCase());
}

export default function MeetingsPage() {
  // useSearchParams reads the URL, which isn't known when Next.js pre-renders this page
  // at build time. A Suspense boundary lets Next render the fallback until it is.
  return (
    <Suspense fallback={<Skeleton className="m-8 h-64" />}>
      <MeetingsPageContent />
    </Suspense>
  );
}

function MeetingsPageContent() {
  const router = useRouter();
  const searchText = useSearchParams().get("search") ?? "";
  const [activeTab, setActiveTab] = useState<MeetingsTab>("upcoming");
  const [meetingToDelete, setMeetingToDelete] = useState<MeetingListItem | null>(null);
  const now = useNow(ONE_MINUTE_MS);
  const { data: user } = useCurrentUser();
  const upcoming = useMeetings("upcoming");
  const recent = useMeetings("recent");
  const cancelMeeting = useCancelMeeting();

  async function confirmDelete() {
    if (meetingToDelete === null) {
      return;
    }
    try {
      await cancelMeeting.mutateAsync(meetingToDelete.meeting_code);
      toast.success(`"${meetingToDelete.title}" was deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the meeting");
    } finally {
      setMeetingToDelete(null);
    }
  }

  /** Edit / Delete appear only on meetings the current user hosts. */
  function hostMenuItems(meeting: MeetingListItem) {
    if (!user || meeting.host.id !== user.id || meeting.status !== "scheduled") {
      return null;
    }
    return (
      <>
        <DropdownDivider />
        <DropdownItem onSelect={() => router.push(`/schedule?edit=${meeting.meeting_code}`)}>
          Edit
        </DropdownItem>
        <DropdownItem isDestructive onSelect={() => setMeetingToDelete(meeting)}>
          Delete
        </DropdownItem>
      </>
    );
  }

  function renderActiveTab() {
    if (!user || !now) {
      return <Skeleton className="mx-4 h-24" />;
    }
    if (activeTab === "personal") {
      return <PersonalRoomPanel user={user} />;
    }
    if (activeTab === "previous") {
      return (
        <RecentMeetingList
          meetings={recent.data?.filter((meeting) => matchesSearch(meeting, searchText))}
          isLoading={recent.isLoading}
          errorMessage={recent.error?.message ?? null}
          timeZone={user.timezone}
          currentUserId={user.id}
          now={now}
        />
      );
    }
    return (
      <UpcomingMeetingList
        meetings={upcoming.data?.filter((meeting) => matchesSearch(meeting, searchText))}
        isLoading={upcoming.isLoading}
        errorMessage={upcoming.error?.message ?? null}
        timeZone={user.timezone}
        currentUserId={user.id}
        now={now}
        renderExtraMenuItems={hostMenuItems}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <Link
          href="/schedule"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-zoom-blue px-5 text-sm font-semibold text-white hover:bg-zoom-blue-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zoom-blue"
        >
          <Plus size={16} aria-hidden /> Schedule a meeting
        </Link>
      </div>

      {searchText && (
        <p className="mb-4 text-sm text-ink-muted">
          Showing meetings matching <strong className="text-ink">“{searchText}”</strong> ·{" "}
          <Link href="/meetings" className="font-semibold text-zoom-blue hover:underline">
            Clear
          </Link>
        </p>
      )}

      <Tabs
        tabs={MEETINGS_TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
        ariaLabel="Meetings"
      />

      <div className="py-4">{renderActiveTab()}</div>

      <ConfirmDialog
        isOpen={meetingToDelete !== null}
        title="Delete meeting?"
        message={
          <>
            <strong className="text-ink">{meetingToDelete?.title}</strong> will be cancelled. Anyone
            with the invite link will see that it was cancelled.
          </>
        }
        confirmLabel="Delete"
        isWorking={cancelMeeting.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setMeetingToDelete(null)}
      />
    </div>
  );
}
