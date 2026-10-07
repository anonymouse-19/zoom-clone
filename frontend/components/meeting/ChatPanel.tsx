/**
 * The Chat panel: messages so far (saved on the server, so they survive a refresh and
 * end up in the summary), and a box to send one to everyone or privately to one person.
 *
 * Sending only asks the server; the message appears when the server sends it back
 * (to everyone, or to just the two people in a private chat), so every screen shows
 * exactly what was saved.
 */

"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { RoomActions } from "@/hooks/useRoomConnection";
import type { ChatMessage } from "@/lib/api";
import { useRoomStore } from "@/stores/roomStore";

import { SidePanel } from "./SidePanel";

// Matches CHAT_MAX_LENGTH on the server.
const CHAT_MAX_LENGTH = 2000;
const EVERYONE = "everyone";

type ChatPanelProps = {
  myParticipantId: number;
  actions: RoomActions;
};

export function ChatPanel({ myParticipantId, actions }: ChatPanelProps) {
  const messages = useRoomStore((state) => state.chatMessages);
  const participants = useRoomStore((state) => state.participants);
  const settings = useRoomStore((state) => state.settings);
  const setOpenPanel = useRoomStore((state) => state.setOpenPanel);
  const [draft, setDraft] = useState("");
  const [recipient, setRecipient] = useState(EVERYONE);
  const listEndRef = useRef<HTMLDivElement>(null);

  const isChatEnabled = settings?.chat_enabled ?? true;
  const others = participants.filter(
    (participant) => participant.participant_id !== myParticipantId,
  );

  // Keep the newest message in view.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text === "") {
      return;
    }
    const toParticipantId = recipient === EVERYONE ? null : Number(recipient);
    actions.send({ type: "chat_message", text, to_participant_id: toParticipantId });
    setDraft("");
  }

  const footer = isChatEnabled ? (
    <form onSubmit={send} className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs text-ink-muted">
        To:
        <select
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border border-line px-2 text-sm text-ink"
        >
          <option value={EVERYONE}>Everyone</option>
          {others.map((participant) => (
            <option key={participant.participant_id} value={participant.participant_id}>
              {participant.display_name} (privately)
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type message here…"
          aria-label="Chat message"
          maxLength={CHAT_MAX_LENGTH}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm focus:border-zoom-blue focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={draft.trim() === ""}
          className="rounded-lg bg-zoom-blue px-3 text-white hover:bg-zoom-blue-hover disabled:opacity-40"
        >
          <Send size={16} aria-hidden />
        </button>
      </div>
    </form>
  ) : (
    <p className="text-center text-xs text-ink-muted">The host has turned off chat.</p>
  );

  return (
    <SidePanel title="Chat" onClose={() => setOpenPanel(null)} footer={footer}>
      {messages.length === 0 ? (
        <p className="p-6 text-center text-sm text-ink-muted">
          Messages you send here can be seen by everyone in the meeting.
        </p>
      ) : (
        <ol className="flex flex-col gap-3 p-3">
          {messages.map((message) => (
            <ChatLine key={message.id} message={message} myParticipantId={myParticipantId} />
          ))}
        </ol>
      )}
      <div ref={listEndRef} />
    </SidePanel>
  );
}

function ChatLine({ message, myParticipantId }: { message: ChatMessage; myParticipantId: number }) {
  const from = message.sender_participant_id === myParticipantId ? "Me" : message.sender_name;
  let to = "Everyone";
  if (message.recipient_participant_id === myParticipantId) {
    to = "Me";
  } else if (message.recipient_name !== null) {
    to = message.recipient_name;
  }
  const isPrivate = message.recipient_participant_id !== null;
  const time = new Date(message.sent_at).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <li className="text-sm">
      <p className="text-xs text-ink-muted">
        {from} to {to}
        {isPrivate && <span className="text-zoom-red"> (privately)</span>} · {time}
      </p>
      <p className="break-words whitespace-pre-wrap">{message.body}</p>
    </li>
  );
}
