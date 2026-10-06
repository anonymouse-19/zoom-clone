/**
 * React access to the saved preferences in lib/preferences.ts.
 *
 * Returns the current preferences, plus a function that changes one and saves it.
 * Every component using this hook sees the change immediately (e.g. toggling
 * "Start with video" in the New meeting menu also updates the Settings modal).
 *
 * How: the preferences live outside React (in localStorage), so we read them with
 * useSyncExternalStore, React's built-in hook for exactly that. We give it three things:
 * - subscribe: how to be told when the value changes
 * - getSnapshot: how to read the current value in the browser
 * - getServerSnapshot: what to use during the server render (no localStorage there),
 *   which keeps the server and browser HTML identical on first load
 */

import { useSyncExternalStore } from "react";

import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Preferences,
} from "@/lib/preferences";

// Read localStorage once and keep the result. getSnapshot must return the *same object*
// until something changes; returning a fresh object every call would make React think
// the value changed on every render, and loop forever.
let cachedPreferences: Preferences | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): Preferences {
  if (cachedPreferences === null) {
    cachedPreferences = loadPreferences();
  }
  return cachedPreferences;
}

function getServerSnapshot(): Preferences {
  return DEFAULT_PREFERENCES;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Change one preference, save it, and tell every subscribed component. */
function updatePreference<Key extends keyof Preferences>(key: Key, value: Preferences[Key]): void {
  cachedPreferences = { ...getSnapshot(), [key]: value };
  savePreferences(cachedPreferences);
  for (const notify of listeners) {
    notify();
  }
}

export function usePreferences() {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { preferences, updatePreference };
}
