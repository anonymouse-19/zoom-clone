/**
 * The bottom bar of the meeting room, like Zoom's:
 *   left:   Mute / Unmute and Start / Stop Video, each with a ^ device menu
 *   centre: Participants (with count), Chat (unread badge), React (emoji + raise hand),
 *           Share (green), More (record, keyboard shortcuts)
 *   right:  End (host) or Leave
 *
 * On phones only Mute, Video, Participants, Share, More and End fit (the spec's phone set):
 * Chat and Raise Hand move into More, and the device menus hide.
 *
 * Presentational: it shows state and calls the handlers it's given. Which panel is open,
 * the counts, and the chosen devices come straight from the room store.
 */

"use client";

import {
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  Smile,
  Users,
  Video,
  VideoOff,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Dropdown, DropdownDivider, DropdownItem } from "@/components/ui/Dropdown";
import type { DeviceLists } from "@/hooks/useMediaDevices";
import { SHORTCUT_LABELS } from "@/hooks/useMeetingShortcuts";
import { REACTION_EMOJIS, type ReactionEmoji } from "@/lib/roomProtocol";
import { useRoomStore, type SidePanel } from "@/stores/roomStore";

import { DeviceMenu } from "./DeviceMenu";

type RoomToolbarProps = {
  isMicOn: boolean;
  isCameraOn: boolean;
  isSharingScreen: boolean;
  /** False when someone else is sharing, or only the host may share. */
  canShareScreen: boolean;
  isHandRaised: boolean;
  isHost: boolean;
  isRecording: boolean;
  devices: DeviceLists;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onReact: (emoji: ReactionEmoji) => void;
  onToggleHand: () => void;
  onToggleRecording: () => void;
  onShowShortcuts: () => void;
  onLeave: () => void;
  onEndForEveryone: () => void;
};

export function RoomToolbar(props: RoomToolbarProps) {
  const participantCount = useRoomStore((state) => state.participants.length);
  const unreadChatCount = useRoomStore((state) => state.unreadChatCount);
  const openPanel = useRoomStore((state) => state.openPanel);
  const setOpenPanel = useRoomStore((state) => state.setOpenPanel);
  const microphoneId = useRoomStore((state) => state.microphoneId);
  const speakerId = useRoomStore((state) => state.speakerId);
  const cameraId = useRoomStore((state) => state.cameraId);
  const setMicrophoneId = useRoomStore((state) => state.setMicrophoneId);
  const setSpeakerId = useRoomStore((state) => state.setSpeakerId);
  const setCameraId = useRoomStore((state) => state.setCameraId);

  function togglePanel(panel: SidePanel) {
    setOpenPanel(openPanel === panel ? null : panel);
  }

  return (
    <footer className="flex h-16 shrink-0 items-center justify-between gap-1 bg-room-toolbar px-1 md:px-4">
      <div className="flex items-center">
        {props.isMicOn ? (
          <ToolbarButton
            icon={Mic}
            label="Mute"
            shortcut={SHORTCUT_LABELS.toggleMic}
            onClick={props.onToggleMic}
          />
        ) : (
          <ToolbarButton
            icon={MicOff}
            label="Unmute"
            shortcut={SHORTCUT_LABELS.toggleMic}
            onClick={props.onToggleMic}
            isOff
          />
        )}
        <PhoneHidden>
          <DeviceMenu
            label="Audio"
            sections={[
              {
                title: "Microphone",
                devices: props.devices.microphones,
                selectedId: microphoneId,
                onSelect: setMicrophoneId,
              },
              {
                title: "Speaker",
                devices: props.devices.speakers,
                selectedId: speakerId,
                onSelect: setSpeakerId,
              },
            ]}
          />
        </PhoneHidden>
        {props.isCameraOn ? (
          <ToolbarButton
            icon={Video}
            label="Stop Video"
            shortcut={SHORTCUT_LABELS.toggleCamera}
            onClick={props.onToggleCamera}
          />
        ) : (
          <ToolbarButton
            icon={VideoOff}
            label="Start Video"
            shortcut={SHORTCUT_LABELS.toggleCamera}
            onClick={props.onToggleCamera}
            isOff
          />
        )}
        <PhoneHidden>
          <DeviceMenu
            label="Video"
            sections={[
              {
                title: "Camera",
                devices: props.devices.cameras,
                selectedId: cameraId,
                onSelect: setCameraId,
              },
            ]}
          />
        </PhoneHidden>
      </div>

      <div className="flex items-center">
        <ToolbarButton
          icon={Users}
          label="Participants"
          shortcut={SHORTCUT_LABELS.toggleParticipants}
          onClick={() => togglePanel("participants")}
          badge={String(participantCount)}
          isActive={openPanel === "participants"}
        />
        <PhoneHidden>
          <ToolbarButton
            icon={MessageSquare}
            label="Chat"
            shortcut={SHORTCUT_LABELS.toggleChat}
            onClick={() => togglePanel("chat")}
            badge={unreadChatCount > 0 ? String(unreadChatCount) : undefined}
            isBadgeAlert
            isActive={openPanel === "chat"}
          />
        </PhoneHidden>
        <PhoneHidden>
          <ReactMenu
            isHandRaised={props.isHandRaised}
            onReact={props.onReact}
            onToggleHand={props.onToggleHand}
          />
        </PhoneHidden>
        <ToolbarButton
          icon={MonitorUp}
          label={props.isSharingScreen ? "Stop Share" : "Share"}
          shortcut={SHORTCUT_LABELS.toggleShare}
          onClick={props.onToggleScreenShare}
          isDisabled={!props.isSharingScreen && !props.canShareScreen}
          isShare
        />
        <MoreMenu
          isRecording={props.isRecording}
          isHandRaised={props.isHandRaised}
          unreadChatCount={unreadChatCount}
          onToggleRecording={props.onToggleRecording}
          onShowShortcuts={props.onShowShortcuts}
          onToggleHand={props.onToggleHand}
          onOpenChat={() => togglePanel("chat")}
        />
      </div>

      <LeaveMenu
        isHost={props.isHost}
        onLeave={props.onLeave}
        onEndForEveryone={props.onEndForEveryone}
      />
    </footer>
  );
}

type ToolbarButtonProps = {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  /** Shown in the tooltip, e.g. "Alt+A". */
  shortcut?: string;
  /** Shows the icon in red, as Zoom does for a muted mic or stopped video. */
  isOff?: boolean;
  /** Zoom's Share button is green. */
  isShare?: boolean;
  isActive?: boolean;
  isDisabled?: boolean;
  /** A small number on the icon (participant count, unread messages). */
  badge?: string;
  /** Red badge (unread) instead of grey (a count). */
  isBadgeAlert?: boolean;
};

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  shortcut,
  isOff = false,
  isShare = false,
  isActive = false,
  isDisabled = false,
  badge,
  isBadgeAlert = false,
}: ToolbarButtonProps) {
  let iconColor = "";
  if (isOff) {
    iconColor = "text-zoom-red";
  } else if (isShare) {
    iconColor = "text-zoom-green";
  }
  const tooltip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
      aria-pressed={isActive || undefined}
      title={tooltip}
      className={`relative flex w-11 flex-col items-center gap-1 rounded-lg py-1.5 text-xs text-white/90 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-zoom-blue disabled:cursor-not-allowed disabled:opacity-40 sm:w-20 ${isActive ? "bg-white/10" : ""}`}
    >
      <Icon size={22} className={iconColor} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
      {badge !== undefined && (
        <span
          className={`absolute top-0 right-1 min-w-4 rounded-full px-1 text-[10px] leading-4 font-semibold sm:right-4 ${isBadgeAlert ? "bg-zoom-red" : "bg-white/20"}`}
          aria-hidden
        >
          {badge}
        </span>
      )}
    </button>
  );
}

/** Shown from small tablets up; hidden on phones (see the header). */
function PhoneHidden({ children }: { children: ReactNode }) {
  return <div className="hidden sm:flex">{children}</div>;
}

/** The look of a toolbar button, for menus whose trigger is drawn by Dropdown. */
function MenuTrigger({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex w-11 flex-col items-center gap-1 py-1.5 text-xs text-white/90 sm:w-20">
      <Icon size={22} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

type ReactMenuProps = {
  isHandRaised: boolean;
  onReact: (emoji: ReactionEmoji) => void;
  onToggleHand: () => void;
};

/** "React": a row of quick emoji reactions, then Raise / Lower Hand. */
function ReactMenu({ isHandRaised, onReact, onToggleHand }: ReactMenuProps) {
  return (
    <Dropdown
      trigger={<MenuTrigger icon={Smile} label="React" />}
      triggerAriaLabel="Reactions and raise hand"
      triggerClassName="rounded-lg hover:bg-white/10"
      align="left"
      opens="above"
    >
      <div className="grid grid-cols-6" role="group" aria-label="Reactions">
        {REACTION_EMOJIS.map((emoji) => (
          <DropdownItem key={emoji} onSelect={() => onReact(emoji)}>
            <span className="text-xl">{emoji}</span>
          </DropdownItem>
        ))}
      </div>
      <DropdownDivider />
      <DropdownItem onSelect={onToggleHand}>
        ✋ {isHandRaised ? "Lower Hand" : "Raise Hand"}
        <span className="ml-auto text-xs text-ink-muted">{SHORTCUT_LABELS.toggleHand}</span>
      </DropdownItem>
    </Dropdown>
  );
}

type MoreMenuProps = {
  isRecording: boolean;
  isHandRaised: boolean;
  unreadChatCount: number;
  onToggleRecording: () => void;
  onShowShortcuts: () => void;
  onToggleHand: () => void;
  onOpenChat: () => void;
};

function MoreMenu(props: MoreMenuProps) {
  return (
    <Dropdown
      trigger={<MenuTrigger icon={MoreHorizontal} label="More" />}
      triggerAriaLabel="More options"
      triggerClassName="rounded-lg hover:bg-white/10"
      align="right"
      opens="above"
    >
      {/* On phones, Chat and Raise Hand live here instead of on the bar. */}
      <div className="sm:hidden">
        <DropdownItem onSelect={props.onOpenChat}>
          Chat{props.unreadChatCount > 0 && ` (${props.unreadChatCount} new)`}
        </DropdownItem>
        <DropdownItem onSelect={props.onToggleHand}>
          ✋ {props.isHandRaised ? "Lower Hand" : "Raise Hand"}
        </DropdownItem>
        <DropdownDivider />
      </div>
      <DropdownItem onSelect={props.onToggleRecording} isDestructive={props.isRecording}>
        {props.isRecording ? "Stop recording" : "Record to this computer"}
      </DropdownItem>
      <DropdownItem onSelect={props.onShowShortcuts}>
        Keyboard shortcuts
        <span className="ml-auto text-xs text-ink-muted">{SHORTCUT_LABELS.showShortcuts}</span>
      </DropdownItem>
    </Dropdown>
  );
}

type LeaveMenuProps = {
  isHost: boolean;
  onLeave: () => void;
  onEndForEveryone: () => void;
};

function LeaveMenu({ isHost, onLeave, onEndForEveryone }: LeaveMenuProps) {
  return (
    <Dropdown
      trigger={isHost ? "End" : "Leave"}
      triggerAriaLabel={isHost ? "End or leave the meeting" : "Leave the meeting"}
      triggerClassName="rounded-lg bg-zoom-red px-3 py-2 text-sm font-semibold text-white hover:brightness-110 md:px-4"
      align="right"
      opens="above"
    >
      {isHost && (
        <DropdownItem onSelect={onEndForEveryone} isDestructive>
          End meeting for all
        </DropdownItem>
      )}
      <DropdownItem onSelect={onLeave} isDestructive={!isHost}>
        Leave meeting
      </DropdownItem>
    </Dropdown>
  );
}
