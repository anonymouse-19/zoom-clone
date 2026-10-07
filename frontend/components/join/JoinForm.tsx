/**
 * The Join page form: one box that accepts a meeting ID ("123 4567 8901", with or without
 * spaces) or any invite link, plus your name and audio/video choices.
 *
 * Join:
 *   Step 1: ask the server what the input is (GET /api/meetings/resolve).
 *   Step 2a: can't join (bad ID, ended, cancelled) → show the server's message inline.
 *   Step 2b: you host it and it hasn't started → offer "Start meeting" (the host door).
 *   Step 2c: otherwise → the pre-join screen, carrying the link's token/passcode and
 *            your choices in the URL.
 */

"use client";

import { ClipboardPaste } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/Button";
import { useCurrentUser } from "@/hooks/queries";
import { useMeetingActions } from "@/hooks/useMeetingActions";
import * as api from "@/lib/api";
import {
  credentialsFromJoinInput,
  formatTypedJoinInput,
  looksLikeJoinInput,
} from "@/lib/meetingCode";

type JoinChoices = {
  displayName: string;
  isAudioOff: boolean;
  isVideoOff: boolean;
  isSharingScreen: boolean;
};

/** Where to send the user next: the pre-join screen for this meeting, with their choices. */
function prejoinUrl(rawInput: string, meetingCode: string, choices: JoinChoices): string {
  const { inviteToken, passcode } = credentialsFromJoinInput(rawInput);
  const params = new URLSearchParams({ name: choices.displayName });
  if (inviteToken) params.set("tk", inviteToken);
  if (passcode) params.set("pwd", passcode);
  if (choices.isAudioOff) params.set("audio", "off");
  if (choices.isVideoOff) params.set("video", "off");
  if (choices.isSharingScreen) params.set("share", "1");
  return `/j/${meetingCode}?${params.toString()}`;
}

export function JoinForm({ isSharingScreen }: { isSharingScreen: boolean }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { startAndEnter, isStarting } = useMeetingActions();
  const [joinInput, setJoinInput] = useState("");
  // `null` until the user edits it, so it can default to their profile name once loaded.
  const [nameInput, setNameInput] = useState<string | null>(null);
  const [isAudioOff, setIsAudioOff] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  // The server's answer when it isn't "go ahead" (bad ID, ended, or "you're the host").
  const [problem, setProblem] = useState<api.ResolveResult | null>(null);
  // The request itself failed (e.g. the server is down).
  const [requestError, setRequestError] = useState<string | null>(null);

  const displayName = nameInput ?? user?.name ?? "";
  const canSubmit = looksLikeJoinInput(joinInput) && displayName.trim() !== "" && !isChecking;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsChecking(true);
    setProblem(null);
    setRequestError(null);
    try {
      const resolved = await api.resolveJoinInput(joinInput);
      const canGoIn = resolved.state === "ready" || resolved.state === "waiting_for_host";
      const shouldOfferHostStart = resolved.you_are_host && resolved.state === "waiting_for_host";
      if (!canGoIn || shouldOfferHostStart || resolved.meeting_code === null) {
        setProblem(resolved);
        return;
      }
      const choices = { displayName: displayName.trim(), isAudioOff, isVideoOff, isSharingScreen };
      router.push(prejoinUrl(joinInput, resolved.meeting_code, choices));
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Couldn't check that meeting");
    } finally {
      setIsChecking(false);
    }
  }

  /**
   * Read the clipboard (only when clicked, so the browser's permission prompt makes
   * sense) and fill in the box if it holds a meeting ID or link.
   */
  async function pasteFromClipboard() {
    let pasted = "";
    try {
      pasted = (await navigator.clipboard.readText()).trim();
    } catch {
      toast.error("The browser didn't allow reading the clipboard");
      return;
    }
    if (!looksLikeJoinInput(pasted)) {
      toast("There's no meeting ID or link on your clipboard");
      return;
    }
    setJoinInput(formatTypedJoinInput(pasted));
    setProblem(null);
    setRequestError(null);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Meeting ID or invite link
        <input
          value={joinInput}
          onChange={(event) => {
            setJoinInput(formatTypedJoinInput(event.target.value));
            setProblem(null);
            setRequestError(null);
          }}
          placeholder="123 4567 8901"
          inputMode="text"
          autoComplete="off"
          autoFocus
          aria-invalid={problem !== null && !problem.you_are_host}
          aria-describedby="join-problem"
          className="h-11 rounded-lg border border-line px-3 text-base font-normal tracking-wide focus:border-zoom-blue focus:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={pasteFromClipboard}
        className="-mt-3 flex items-center gap-1.5 self-start text-sm font-medium text-zoom-blue hover:underline"
      >
        <ClipboardPaste size={14} aria-hidden /> Paste meeting link from clipboard
      </button>

      <div id="join-problem" aria-live="polite">
        {problem && !problem.you_are_host && (
          <p role="alert" className="-mt-3 text-sm text-zoom-red">
            {problem.message}
          </p>
        )}
        {requestError && (
          <p role="alert" className="-mt-3 text-sm text-zoom-red">
            {requestError}
          </p>
        )}
        {problem?.you_are_host && problem.meeting_code && (
          <div className="-mt-2 rounded-lg bg-zoom-blue-soft p-3 text-sm">
            <p>
              You&apos;re the host of <strong>{problem.title}</strong>, and it hasn&apos;t started
              yet.
            </p>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => problem.meeting_code && startAndEnter(problem.meeting_code)}
              disabled={isStarting}
            >
              Start meeting
            </Button>
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your name
        <input
          value={displayName}
          onChange={(event) => setNameInput(event.target.value)}
          maxLength={100}
          className="h-11 rounded-lg border border-line px-3 font-normal focus:border-zoom-blue focus:outline-none"
        />
      </label>

      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="sr-only">Join options</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isAudioOff}
            onChange={(event) => setIsAudioOff(event.target.checked)}
            className="h-4 w-4 accent-zoom-blue"
          />
          Don&apos;t connect to audio
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isVideoOff}
            onChange={(event) => setIsVideoOff(event.target.checked)}
            className="h-4 w-4 accent-zoom-blue"
          />
          Turn off my video
        </label>
      </fieldset>

      <Button type="submit" disabled={!canSubmit} className="w-full">
        {isChecking ? "Checking…" : "Join"}
      </Button>
    </form>
  );
}
