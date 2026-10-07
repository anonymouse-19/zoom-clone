/**
 * Zoom's keyboard shortcuts in the meeting room, plus push-to-talk:
 *
 *   Alt+A mute / unmute       Alt+V start / stop video     Alt+S share screen
 *   Alt+H chat panel          Alt+U participants panel     Alt+Y raise / lower hand
 *   ?     this list           hold Space while muted: talk (push-to-talk)
 *
 * Keys are matched by `event.code` (the physical key), because on a Mac Alt+A types "å",
 * so `event.key` would never be "a". Nothing fires while typing in a text box (chat), so
 * Alt+A doesn't toggle the mic there and Space just types a space.
 */

import { useEffect, useEffectEvent, useRef } from "react";

export type ShortcutAction =
  | "toggleMic"
  | "toggleCamera"
  | "toggleShare"
  | "toggleChat"
  | "toggleParticipants"
  | "toggleHand"
  | "showShortcuts";

/** How each shortcut is written: in tooltips, menus and the cheat sheet. */
export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toggleMic: "Alt+A",
  toggleCamera: "Alt+V",
  toggleShare: "Alt+S",
  toggleChat: "Alt+H",
  toggleParticipants: "Alt+U",
  toggleHand: "Alt+Y",
  showShortcuts: "?",
};

export const SHORTCUT_DESCRIPTIONS: Record<ShortcutAction, string> = {
  toggleMic: "Mute / unmute",
  toggleCamera: "Start / stop video",
  toggleShare: "Start / stop sharing your screen",
  toggleChat: "Show / hide the chat",
  toggleParticipants: "Show / hide participants",
  toggleHand: "Raise / lower your hand",
  showShortcuts: "Show this list",
};

// Alt + which physical key does what.
const ALT_KEY_ACTIONS: Record<string, ShortcutAction> = {
  KeyA: "toggleMic",
  KeyV: "toggleCamera",
  KeyS: "toggleShare",
  KeyH: "toggleChat",
  KeyU: "toggleParticipants",
  KeyY: "toggleHand",
};

type MeetingShortcutOptions = {
  actions: Record<ShortcutAction, () => void>;
  isMicOn: boolean;
  setMicOn: (isMicOn: boolean) => void;
};

export function useMeetingShortcuts({ actions, isMicOn, setMicOn }: MeetingShortcutOptions) {
  // True while Space is held down and it unmuted us (so letting go mutes again).
  const isPushToTalkingRef = useRef(false);

  // useEffectEvent: the listeners below are added once, but always see the latest
  // actions and mic state.
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (isTypingIn(event.target)) {
      return;
    }
    const altAction = ALT_KEY_ACTIONS[event.code];
    if (event.altKey && altAction !== undefined) {
      event.preventDefault();
      actions[altAction]();
    } else if (event.key === "?") {
      actions.showShortcuts();
    } else if (
      event.code === "Space" &&
      !event.repeat &&
      !isMicOn &&
      !isButtonOrLink(event.target)
    ) {
      event.preventDefault(); // don't scroll the page
      isPushToTalkingRef.current = true;
      setMicOn(true);
    }
  });

  const handleKeyUp = useEffectEvent((event: KeyboardEvent) => {
    if (event.code === "Space" && isPushToTalkingRef.current) {
      isPushToTalkingRef.current = false;
      setMicOn(false);
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
    const onKeyUp = (event: KeyboardEvent) => handleKeyUp(event);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}

/** A text box (chat, search): keys there are for typing. */
function isTypingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Space presses a focused button or link, so it can't also mean push-to-talk there. */
function isButtonOrLink(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && ["BUTTON", "A"].includes(target.tagName);
}
