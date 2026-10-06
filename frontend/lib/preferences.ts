/**
 * The user's local preferences (Settings modal and the New meeting menu), saved in the
 * browser's localStorage.
 *
 * Called by: hooks/usePreferences.ts. Later phases read them when joining a meeting
 * (start muted / camera off) and when drawing the self-view (mirror).
 *
 * Why localStorage and not the database: these are per-device conveniences, just like
 * Zoom's desktop settings. Losing them (private window, cleared storage) is harmless,
 * which is why every read falls back to the defaults.
 */

export type Preferences = {
  /** New meeting menu: start meetings with the camera on. */
  startWithVideo: boolean;
  /** New meeting menu: use my Personal Meeting ID for instant meetings. */
  usePersonalMeetingId: boolean;
  /** Settings → Audio: join every meeting muted. */
  joinMuted: boolean;
  /** Settings → Video: show my own video mirrored, like a mirror (Zoom's default). */
  mirrorMyVideo: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  startWithVideo: true,
  usePersonalMeetingId: false,
  joinMuted: false,
  mirrorMyVideo: true,
};

const STORAGE_KEY = "zoom-clone:preferences";

/** Read saved preferences, filling any missing field with its default. */
export function loadPreferences(): Preferences {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return DEFAULT_PREFERENCES;
    }
    // Spread over the defaults, so a preference added in a later version still gets a value.
    return { ...DEFAULT_PREFERENCES, ...(JSON.parse(saved) as Partial<Preferences>) };
  } catch {
    // Storage blocked (private mode) or corrupted JSON: fall back to the defaults.
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage blocked: the preference just won't survive a reload. Nothing else breaks.
  }
}
