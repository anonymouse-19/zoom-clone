/**
 * Meeting code helpers for display and typing.
 *
 * formatMeetingCode mirrors backend/app/services/codes.py:format_meeting_code, and
 * looksLikeJoinInput is a quick client-side version of join_service.parse_join_input.
 * The server stays the authority: the client check only decides whether the Join button
 * is enabled, and GET /api/meetings/resolve gives the real answer.
 */

const MEETING_CODE_LENGTH = 11; // "XXX XXXX XXXX"
const PERSONAL_MEETING_ID_LENGTH = 10; // "XXX XXX XXXX"

// Digits plus the separators people type between groups: "123 4567-8901".
const DIGITS_AND_SEPARATORS = /^[\d\s-]*$/;
const SEPARATORS = /[\s-]/g;
// A meeting code inside an invite link path: /j/12345678901 or /room/12345678901.
const INVITE_PATH = /\/(?:j|room)\/\d{10,11}(?:[/?#]|$)/;

/** Group digits the way Zoom shows them. Anything else is returned unchanged. */
export function formatMeetingCode(code: string): string {
  if (code.length === MEETING_CODE_LENGTH) {
    return `${code.slice(0, 3)} ${code.slice(3, 7)} ${code.slice(7)}`;
  }
  if (code.length === PERSONAL_MEETING_ID_LENGTH) {
    return `${code.slice(0, 3)} ${code.slice(3, 6)} ${code.slice(6)}`;
  }
  return code;
}

/**
 * Re-format the join box while the user types digits. Up to 10 digits are grouped
 * 3-3-4 (a Personal Meeting ID); an 11th digit switches to 3-4-4 (a meeting code).
 * Anything with letters or slashes (a pasted link) is left exactly as typed.
 */
export function formatTypedJoinInput(input: string): string {
  if (!DIGITS_AND_SEPARATORS.test(input)) {
    return input;
  }
  const digits = input.replace(SEPARATORS, "").slice(0, MEETING_CODE_LENGTH);
  if (digits.length === MEETING_CODE_LENGTH) {
    return formatMeetingCode(digits);
  }
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  return groups.filter((group) => group.length > 0).join(" ");
}

/**
 * The invite token (`tk`) and passcode (`pwd`) carried by a pasted link, if any.
 * A bare meeting ID has neither.
 */
export function credentialsFromJoinInput(input: string): {
  inviteToken: string | null;
  passcode: string | null;
} {
  const trimmed = input.trim();
  if (!trimmed.includes("/")) {
    return { inviteToken: null, passcode: null };
  }
  try {
    // "localhost:3000/j/123..." has no scheme; add one so the URL parser accepts it.
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return { inviteToken: url.searchParams.get("tk"), passcode: url.searchParams.get("pwd") };
  } catch {
    return { inviteToken: null, passcode: null };
  }
}

/** True if the input could be a meeting ID or an invite link (enables the Join button). */
export function looksLikeJoinInput(input: string): boolean {
  const trimmed = input.trim();
  if (DIGITS_AND_SEPARATORS.test(trimmed)) {
    const digitCount = trimmed.replace(SEPARATORS, "").length;
    return digitCount === PERSONAL_MEETING_ID_LENGTH || digitCount === MEETING_CODE_LENGTH;
  }
  return INVITE_PATH.test(trimmed);
}
