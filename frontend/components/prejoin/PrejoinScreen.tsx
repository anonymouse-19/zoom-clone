/**
 * The pre-join screen (/j/{code}): the guest door into a meeting.
 *
 * PrejoinScreen asks the server whether the meeting can be joined, and shows either a
 * "can't join" card (not found / ended / cancelled) or the PrejoinForm.
 *
 * PrejoinForm is the device check (camera preview, mic meter, device pickers, test
 * speaker) plus name and passcode. Join then:
 *   Step 1: if the host hasn't started, wait (polling) and continue automatically.
 *   Step 2: POST /participants as a guest → a participant id + secret session token.
 *   Step 3: save that "join ticket" for this tab, and go to the room.
 */

"use client";

import { Mic, Speaker, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Feedback";
import { useCurrentUser, useJoinMeeting, useResolvedJoinInput } from "@/hooks/queries";
import { useLocalMedia } from "@/hooks/useLocalMedia";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useMeetingActions } from "@/hooks/useMeetingActions";
import { usePreferences } from "@/hooks/usePreferences";
import type { JoinMeetingResult, ResolveResult } from "@/lib/api";
import { playTestSound } from "@/lib/audio";
import { loginPath } from "@/lib/authRedirect";
import { saveMeetingSession } from "@/lib/meetingSession";

import { DevicePreview } from "./DevicePreview";
import { DeviceSelect } from "./DeviceSelect";
import { JoinStatusCard } from "./JoinStatusCard";
import { MicLevelMeter } from "./MicLevelMeter";
import { WaitingForHost } from "./WaitingForHost";

/** What arrived in the invite link / from the Join page. */
export type PrejoinOptions = {
  meetingCode: string;
  inviteToken: string | null;
  linkPasscode: string | null;
  initialName: string | null;
  startMuted: boolean;
  startWithVideoOff: boolean;
  /** Came from the Home "Share screen" tile: start sharing once in the room (Phase 6). */
  shareAfterJoin: boolean;
};

const STATES_THAT_BLOCK_JOINING = new Set(["not_found", "ended", "cancelled", "invalid_input"]);

/** The invite-link form of this meeting, which /resolve understands. */
function joinInputFor(options: PrejoinOptions): string {
  const params = new URLSearchParams();
  if (options.inviteToken) params.set("tk", options.inviteToken);
  if (options.linkPasscode) params.set("pwd", options.linkPasscode);
  return `/j/${options.meetingCode}?${params.toString()}`;
}

/**
 * Where "Rejoin" in the room leads if this join session ends: the same link, plus any
 * passcode that was typed and the name used, so rejoining needs no retyping.
 */
function rejoinPathFor(
  options: PrejoinOptions,
  typedPasscode: string,
  displayName: string,
): string {
  const params = new URLSearchParams();
  if (options.inviteToken) params.set("tk", options.inviteToken);
  const passcode = typedPasscode || options.linkPasscode;
  if (passcode) params.set("pwd", passcode);
  params.set("name", displayName);
  return `/j/${options.meetingCode}?${params.toString()}`;
}

export function PrejoinScreen(options: PrejoinOptions) {
  const resolved = useResolvedJoinInput(joinInputFor(options));

  if (resolved.isLoading) {
    return (
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[1fr_360px]">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (resolved.error || !resolved.data) {
    return <JoinStatusCard title="Something went wrong" message={resolved.error?.message ?? ""} />;
  }
  if (STATES_THAT_BLOCK_JOINING.has(resolved.data.state)) {
    return <JoinStatusCard title="Unable to join" message={resolved.data.message} />;
  }
  return <PrejoinForm options={options} resolved={resolved.data} />;
}

function PrejoinForm({ options, resolved }: { options: PrejoinOptions; resolved: ResolveResult }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { preferences } = usePreferences();
  const { startAndEnter, isStarting } = useMeetingActions();
  const joinMutation = useJoinMeeting();

  // `null` = "not touched yet": until the user changes it, each value follows the link
  // and their saved preferences (which load after the first render).
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [micChoice, setMicChoice] = useState<boolean | null>(null);
  const [cameraChoice, setCameraChoice] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [microphoneId, setMicrophoneId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [isTestingSpeaker, setIsTestingSpeaker] = useState(false);
  const [isWaitingToJoin, setIsWaitingToJoin] = useState(false);

  const displayName = nameInput ?? options.initialName ?? user?.name ?? "";
  const isMicOn = micChoice ?? (!options.startMuted && !preferences.joinMuted);
  const isCameraOn = cameraChoice ?? (!options.startWithVideoOff && preferences.startWithVideo);
  const media = useLocalMedia({ isCameraOn, isMicOn, cameraId, microphoneId });
  const devices = useMediaDevices(media.videoTrack !== null || media.audioTrack !== null);

  const needsPasscode = resolved.passcode_required && !options.linkPasscode;
  const isWaitingForHost = resolved.state === "waiting_for_host";
  const canJoin =
    displayName.trim() !== "" && (!needsPasscode || passcode !== "") && !joinMutation.isPending;

  /** Step 3: remember who we joined as (for this tab only), then enter the room. */
  function enterRoom(joined: JoinMeetingResult) {
    saveMeetingSession({
      meetingCode: options.meetingCode,
      participantId: joined.participant_id,
      sessionToken: joined.session_token,
      displayName: joined.display_name,
      role: joined.role,
      status: joined.status,
      isMicOn,
      isCameraOn,
      cameraId,
      microphoneId,
      speakerId,
      rejoinPath: rejoinPathFor(options, passcode, joined.display_name),
    });
    router.push(`/room/${options.meetingCode}${options.shareAfterJoin ? "?share=1" : ""}`);
  }

  /** Step 2: join through the guest door. */
  function join() {
    const input = {
      display_name: displayName.trim(),
      join_as: "guest" as const,
      invite_token: options.inviteToken ?? undefined,
      passcode: passcode || options.linkPasscode || undefined,
    };
    joinMutation.mutate(
      { meetingCode: options.meetingCode, input },
      { onSuccess: enterRoom, onError: () => setIsWaitingToJoin(false) },
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isWaitingForHost) {
      setIsWaitingToJoin(true); // Step 1: wait; the effect below joins when the host starts.
    } else {
      join();
    }
  }

  // useEffectEvent: lets the effect call the *latest* join() (with the current name,
  // devices, etc.) without that function being a dependency that re-runs the effect.
  const joinNowThatHostStarted = useEffectEvent(() => {
    if (joinMutation.isIdle) {
      join();
    }
  });
  useEffect(() => {
    if (isWaitingToJoin && resolved.state === "ready") {
      joinNowThatHostStarted();
    }
  }, [isWaitingToJoin, resolved.state]);

  async function testSpeaker() {
    setIsTestingSpeaker(true);
    try {
      await playTestSound(speakerId);
    } finally {
      setIsTestingSpeaker(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl items-start gap-8 px-4 py-8 lg:grid-cols-[1fr_360px]">
      <section aria-label="Camera and microphone preview">
        <DevicePreview
          displayName={displayName}
          videoTrack={media.videoTrack}
          isCameraOn={isCameraOn}
          isMicOn={isMicOn}
          isMirrored={preferences.mirrorMyVideo}
          videoError={media.videoError}
          audioError={media.audioError}
          onToggleCamera={() => setCameraChoice(!isCameraOn)}
          onToggleMic={() => setMicChoice(!isMicOn)}
        />
        <div className="mt-3 flex items-center gap-3 text-xs text-ink-muted">
          <span>Microphone</span>
          <MicLevelMeter track={media.audioTrack} />
          {!isMicOn && <span>(muted)</span>}
        </div>
      </section>

      <aside className="rounded-2xl border border-line bg-white p-6 shadow-sm">
        {isWaitingToJoin && isWaitingForHost ? (
          <WaitingForHost
            meetingTitle={resolved.title ?? ""}
            startTime={resolved.start_time}
            timeZone={user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
            onCancel={() => setIsWaitingToJoin(false)}
          />
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold">{resolved.title}</h1>
              <p className="mt-1 text-sm text-ink-muted">
                Hosted by {resolved.host_name} · ID {resolved.formatted_code}
              </p>
            </div>

            {isWaitingForHost && user === null && (
              <p className="text-sm text-ink-muted">
                Are you the host?{" "}
                <Link
                  href={loginPath(`/j/${options.meetingCode}`)}
                  className="font-semibold text-zoom-blue hover:underline"
                >
                  Log in
                </Link>{" "}
                to start this meeting.
              </p>
            )}

            {resolved.you_are_host && (
              <div className="rounded-lg bg-zoom-blue-soft p-3 text-sm">
                <p>You&apos;re the host of this meeting.</p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => startAndEnter(options.meetingCode)}
                  disabled={isStarting}
                >
                  Start as host
                </Button>
              </div>
            )}

            <label className="flex flex-col gap-1 text-sm font-medium">
              Your name
              <input
                value={displayName}
                onChange={(event) => setNameInput(event.target.value)}
                maxLength={100}
                required
                className="h-10 rounded-lg border border-line px-3 font-normal focus:border-zoom-blue focus:outline-none"
              />
            </label>

            {needsPasscode && (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Meeting passcode
                <input
                  value={passcode}
                  onChange={(event) => setPasscode(event.target.value)}
                  type="password"
                  autoComplete="off"
                  required
                  className="h-10 rounded-lg border border-line px-3 font-normal focus:border-zoom-blue focus:outline-none"
                />
              </label>
            )}

            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <DeviceSelect
                label="Camera"
                icon={<Video size={14} aria-hidden />}
                devices={devices.cameras}
                selectedId={cameraId}
                onChange={setCameraId}
              />
              <DeviceSelect
                label="Microphone"
                icon={<Mic size={14} aria-hidden />}
                devices={devices.microphones}
                selectedId={microphoneId}
                onChange={setMicrophoneId}
              />
              {devices.speakers.length > 0 && (
                <DeviceSelect
                  label="Speaker"
                  icon={<Speaker size={14} aria-hidden />}
                  devices={devices.speakers}
                  selectedId={speakerId}
                  onChange={setSpeakerId}
                />
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={testSpeaker}
                disabled={isTestingSpeaker}
                className="self-start"
              >
                <Speaker size={14} aria-hidden />
                {isTestingSpeaker ? "Playing…" : "Test speaker"}
              </Button>
            </div>

            {joinMutation.error && (
              <p role="alert" className="text-sm text-zoom-red">
                {joinMutation.error.message}
              </p>
            )}

            <Button type="submit" disabled={!canJoin} className="w-full">
              {joinMutation.isPending ? "Joining…" : "Join"}
            </Button>
            {isWaitingForHost && (
              <p className="-mt-2 text-center text-xs text-ink-muted">
                The host hasn&apos;t started yet. Press Join and you&apos;ll go in automatically.
              </p>
            )}
          </form>
        )}
      </aside>
    </div>
  );
}
