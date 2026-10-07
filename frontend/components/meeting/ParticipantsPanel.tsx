/**
 * The Participants panel: everyone in the meeting (raised hands first, in the order they
 * went up), the waiting room, and, for hosts and co-hosts, the host controls.
 *
 * Every button here only *asks* the server (a WebSocket message). The server checks the
 * sender's role and refuses anyone who isn't allowed (backend realtime/host_controls.py),
 * so hiding buttons from attendees is for tidiness, not security.
 */

"use client";

import { Hand, Mic, MicOff, MoreHorizontal, Video, VideoOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import type { RoomActions } from "@/hooks/useRoomConnection";
import type { RosterEntry } from "@/lib/roomProtocol";
import { useRoomStore } from "@/stores/roomStore";

import { SidePanel } from "./SidePanel";

type ParticipantsPanelProps = {
  myParticipantId: number;
  actions: RoomActions;
  /** The invitation text, for "Invite" (undefined until the meeting details load). */
  invitation: string | undefined;
};

export function ParticipantsPanel({
  myParticipantId,
  actions,
  invitation,
}: ParticipantsPanelProps) {
  const participants = useRoomStore((state) => state.participants);
  const waiting = useRoomStore((state) => state.waiting);
  const isLocked = useRoomStore((state) => state.isLocked);
  const setOpenPanel = useRoomStore((state) => state.setOpenPanel);
  const [search, setSearch] = useState("");

  const me = participants.find((participant) => participant.participant_id === myParticipantId);
  const amModerator = me?.role === "host" || me?.role === "co_host";
  const matchingSearch = participants.filter((participant) =>
    participant.display_name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  async function copyInvitation() {
    if (invitation !== undefined) {
      await navigator.clipboard.writeText(invitation);
      toast.success("Invitation copied to clipboard");
    }
  }

  const hostFooter = (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => actions.send({ type: "mute_all" })}>
        Mute all
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => actions.send({ type: "ask_all_to_unmute" })}
      >
        Ask all to unmute
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => actions.send({ type: "lock_meeting", is_locked: !isLocked })}
      >
        {isLocked ? "Unlock meeting" : "Lock meeting"}
      </Button>
    </div>
  );

  return (
    <SidePanel
      title={`Participants (${participants.length})`}
      onClose={() => setOpenPanel(null)}
      footer={amModerator ? hostFooter : undefined}
    >
      <div className="flex gap-2 p-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search"
          aria-label="Search participants"
          className="h-9 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm focus:border-zoom-blue focus:outline-none"
        />
        <Button size="sm" variant="secondary" onClick={copyInvitation}>
          Invite
        </Button>
      </div>

      {amModerator && waiting.length > 0 && (
        <section aria-label="Waiting room" className="border-b border-line px-3 pb-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink-muted">
              Waiting room ({waiting.length})
            </h3>
            <Button size="sm" onClick={() => actions.send({ type: "admit_all" })}>
              Admit all
            </Button>
          </div>
          <ul className="flex flex-col gap-1">
            {waiting.map((person) => (
              <li key={person.participant_id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{person.display_name}</span>
                <Button
                  size="sm"
                  onClick={() =>
                    actions.send({ type: "admit", participant_id: person.participant_id })
                  }
                >
                  Admit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    actions.send({ type: "deny", participant_id: person.participant_id })
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul aria-label="In the meeting" className="flex flex-col py-1">
        {inHandQueueOrder(matchingSearch).map((participant) => (
          <ParticipantRow
            key={participant.participant_id}
            participant={participant}
            isMe={participant.participant_id === myParticipantId}
            myRole={me?.role}
            actions={actions}
          />
        ))}
      </ul>
    </SidePanel>
  );
}

/**
 * Raised hands first, earliest first (so the host calls on people fairly), then everyone
 * else in the order they joined.
 */
function inHandQueueOrder(participants: RosterEntry[]): RosterEntry[] {
  const raised = participants
    .filter((participant) => participant.hand_raised_at !== null)
    .sort((first, second) =>
      (first.hand_raised_at ?? "").localeCompare(second.hand_raised_at ?? ""),
    );
  const notRaised = participants.filter((participant) => participant.hand_raised_at === null);
  return [...raised, ...notRaised];
}

const ROLE_LABELS = { host: "Host", co_host: "Co-host", attendee: "" };

type ParticipantRowProps = {
  participant: RosterEntry;
  isMe: boolean;
  myRole: RosterEntry["role"] | undefined;
  actions: RoomActions;
};

function ParticipantRow({ participant, isMe, myRole, actions }: ParticipantRowProps) {
  const amModerator = myRole === "host" || myRole === "co_host";
  const labels = [ROLE_LABELS[participant.role], isMe ? "me" : ""].filter(Boolean).join(", ");

  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-canvas">
      <span className="min-w-0 flex-1 truncate">
        {participant.display_name}
        {labels && <span className="text-ink-muted"> ({labels})</span>}
      </span>
      {participant.hand_raised_at !== null && (
        <Hand size={16} className="text-zoom-orange" aria-label="Hand raised" />
      )}
      {participant.is_mic_on ? (
        <Mic size={16} className="text-ink-muted" aria-label="Unmuted" />
      ) : (
        <MicOff size={16} className="text-zoom-red" aria-label="Muted" />
      )}
      {participant.is_camera_on ? (
        <Video size={16} className="text-ink-muted" aria-label="Camera on" />
      ) : (
        <VideoOff size={16} className="text-zoom-red" aria-label="Camera off" />
      )}
      {amModerator && !isMe && (
        <HostActionsMenu participant={participant} myRole={myRole} actions={actions} />
      )}
    </li>
  );
}

type HostActionsMenuProps = {
  participant: RosterEntry;
  myRole: RosterEntry["role"] | undefined;
  actions: RoomActions;
};

/** The "…" menu on a participant's row: what a host or co-host can do to them. */
function HostActionsMenu({ participant, myRole, actions }: HostActionsMenuProps) {
  const id = participant.participant_id;
  const amHost = myRole === "host";
  const isTargetHost = participant.role === "host";

  return (
    <Dropdown
      trigger={<MoreHorizontal size={16} aria-hidden />}
      triggerAriaLabel={`More actions for ${participant.display_name}`}
      triggerClassName="rounded-md p-1 text-ink-muted hover:bg-white hover:text-ink"
    >
      {participant.is_mic_on ? (
        <DropdownItem
          onSelect={() => actions.send({ type: "mute_participant", participant_id: id })}
        >
          Mute
        </DropdownItem>
      ) : (
        <DropdownItem onSelect={() => actions.send({ type: "ask_to_unmute", participant_id: id })}>
          Ask to unmute
        </DropdownItem>
      )}
      {participant.hand_raised_at !== null && (
        <DropdownItem onSelect={() => actions.send({ type: "lower_hand", participant_id: id })}>
          Lower hand
        </DropdownItem>
      )}
      {amHost && !isTargetHost && (
        <DropdownItem
          onSelect={() =>
            actions.send({
              type: "set_co_host",
              participant_id: id,
              is_co_host: participant.role !== "co_host",
            })
          }
        >
          {participant.role === "co_host" ? "Withdraw co-host permission" : "Make co-host"}
        </DropdownItem>
      )}
      {amHost && (
        <DropdownItem onSelect={() => actions.send({ type: "make_host", participant_id: id })}>
          Make host
        </DropdownItem>
      )}
      {!isTargetHost && (
        <DropdownItem
          isDestructive
          onSelect={() => actions.send({ type: "remove_participant", participant_id: id })}
        >
          Remove
        </DropdownItem>
      )}
    </Dropdown>
  );
}
