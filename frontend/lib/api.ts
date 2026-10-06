/**
 * The single typed client for the backend REST API.
 *
 * Called by: the React Query hooks in hooks/queries.ts (and a few event handlers).
 * No other file calls fetch() for REST, so the base URL, JSON handling and error
 * messages are written once, here.
 * Calls: the FastAPI backend at API_URL (see lib/config.ts).
 *
 * The types below mirror the Pydantic schemas in backend/app/schemas/. If you change a
 * schema there, change its type here too. Datetimes arrive as ISO strings in UTC
 * (e.g. "2026-10-08T04:00:00Z") and are formatted for display by lib/format.ts.
 */

import { API_URL } from "@/lib/config";

// ---------------------------------------------------------------------------
// Types (mirror backend/app/schemas)
// ---------------------------------------------------------------------------

export type MeetingType = "instant" | "scheduled" | "personal";
export type MeetingStatus = "scheduled" | "live" | "ended" | "cancelled";
export type ScreenSharePermission = "host_only" | "all";
export type MeetingScope = "upcoming" | "recent" | "all";
export type Recurrence = "none" | "daily" | "weekly";
export type ParticipantRole = "host" | "co_host" | "attendee";
export type ParticipantStatus = "waiting" | "admitted" | "left" | "removed";

export type User = {
  id: number;
  name: string;
  email: string;
  avatar_color: string;
  timezone: string;
  personal_meeting_id: string;
};

export type Host = {
  id: number;
  name: string;
  avatar_color: string;
};

export type MeetingSettings = {
  waiting_room_enabled: boolean;
  mute_on_entry: boolean;
  video_on_entry_host: boolean;
  video_on_entry_participant: boolean;
  allow_join_before_host: boolean;
  allow_screen_share: ScreenSharePermission;
  chat_enabled: boolean;
};

export type MeetingListItem = {
  meeting_code: string;
  formatted_code: string;
  title: string;
  type: MeetingType;
  status: MeetingStatus;
  start_time: string | null;
  duration_minutes: number;
  timezone: string;
  recurrence: Recurrence;
  started_at: string | null;
  ended_at: string | null;
  host: Host;
  attendee_count: number;
};

export type MeetingDetail = MeetingListItem & {
  description: string;
  passcode: string;
  invite_link: string;
  invitation: string;
  settings: MeetingSettings;
  invitees: { email: string; name: string | null }[];
  created_at: string;
  updated_at: string;
};

export type ScheduleMeetingInput = {
  title: string;
  description: string;
  start_time: string; // ISO string with offset, e.g. new Date().toISOString()
  duration_minutes: number;
  timezone: string;
  recurrence: Recurrence;
  passcode?: string;
  settings: Partial<MeetingSettings>;
  invitees: string[];
};

export type UpdateMeetingInput = Partial<ScheduleMeetingInput>;

export type JoinState =
  "ready" | "waiting_for_host" | "ended" | "cancelled" | "not_found" | "invalid_input";

export type ResolveResult = {
  state: JoinState;
  message: string;
  meeting_code: string | null;
  formatted_code: string | null;
  title: string | null;
  host_name: string | null;
  passcode_required: boolean;
  you_are_host: boolean;
};

/** Which "door" a join comes through (see docs/DECISIONS.md D-045). */
export type JoinAs = "host" | "guest";

export type JoinMeetingInput = {
  display_name: string;
  join_as: JoinAs;
  invite_token?: string;
  passcode?: string;
};

export type JoinMeetingResult = {
  participant_id: number;
  session_token: string;
  display_name: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  meeting: MeetingDetail;
};

export type ChatMessage = {
  id: number;
  sender_participant_id: number;
  sender_name: string;
  recipient_participant_id: number | null;
  recipient_name: string | null;
  body: string;
  sent_at: string;
};

export type Attendee = {
  display_name: string;
  is_guest: boolean;
  role: ParticipantRole;
  sessions: { joined_at: string; left_at: string | null }[];
  total_minutes: number;
};

export type MeetingSummary = {
  meeting_code: string;
  formatted_code: string;
  title: string;
  host_name: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  attendees: Attendee[];
  messages: ChatMessage[];
};

// ---------------------------------------------------------------------------
// Request helper
// ---------------------------------------------------------------------------

/** Thrown for any non-2xx response, so callers can show the status and message. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const NO_CONTENT = 204;

/**
 * Send a request to `${API_URL}/api${path}` and parse the JSON body as type T.
 *
 * Side effects: one network request.
 * Throws: ApiError on a non-2xx status; TypeError if the network itself fails
 * (server down, or the browser blocked the response because of CORS).
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // INTERVIEW: only requests with a JSON body get a Content-Type header. A GET without it
  // counts as a "simple" request, so the browser skips the CORS preflight (an extra
  // OPTIONS round trip before every call).
  if (init?.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}/api${path}`, { ...init, headers });

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }
  if (response.status === NO_CONTENT) {
    // 204 has no body to parse. Callers of such endpoints use request<void>.
    return undefined as T;
  }
  // The `as T` is a promise to TypeScript, not a runtime check. It is safe because the
  // backend validates every response against a Pydantic model before sending it.
  return (await response.json()) as T;
}

/** POST/PATCH helper: serializes `body` as JSON. */
function sendJson<T>(method: "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Pull a human-readable message out of an error response.
 *
 * FastAPI uses two shapes: our service errors send {"detail": "text"}, and validation
 * errors (422) send {"detail": [{"loc": [...], "msg": "text"}, ...]}.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    // `unknown` (not `any`) forces us to check the shape before reading fields.
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || !("detail" in body)) {
      return response.statusText;
    }
    const detail = body.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === "string") {
      return detail[0].msg;
    }
  } catch {
    // Body was empty or not JSON. Fall through to the status text.
  }
  return response.statusText;
}

// ---------------------------------------------------------------------------
// Endpoint functions: one per backend route
// ---------------------------------------------------------------------------

/** GET /api/health: confirms the backend is reachable from the browser. */
export function getHealth(): Promise<{ status: "ok" }> {
  return request("/health");
}

/** GET /api/me: the logged-in (seeded) user. */
export function getMe(): Promise<User> {
  return request("/me");
}

/** GET /api/meetings?scope=...: meetings the user hosts, is invited to, or attended. */
export function listMeetings(scope: MeetingScope): Promise<MeetingListItem[]> {
  return request(`/meetings?scope=${scope}`);
}

/** GET /api/meetings/{code}: full details, including the invite link and invitation text. */
export function getMeeting(meetingCode: string): Promise<MeetingDetail> {
  return request(`/meetings/${meetingCode}`);
}

/** POST /api/meetings/instant: a meeting that is live immediately ("New meeting"). */
export function createInstantMeeting(options: {
  usePersonalMeetingId: boolean;
  title?: string;
}): Promise<MeetingDetail> {
  return sendJson("POST", "/meetings/instant", {
    use_personal_meeting_id: options.usePersonalMeetingId,
    title: options.title ?? "",
  });
}

/** POST /api/meetings: schedule a meeting for later. */
export function scheduleMeeting(input: ScheduleMeetingInput): Promise<MeetingDetail> {
  return sendJson("POST", "/meetings", input);
}

/** PATCH /api/meetings/{code}: change only the fields given. Host only. */
export function updateMeeting(
  meetingCode: string,
  changes: UpdateMeetingInput,
): Promise<MeetingDetail> {
  return sendJson("PATCH", `/meetings/${meetingCode}`, changes);
}

/** DELETE /api/meetings/{code}: cancel (soft delete). Host only. */
export function cancelMeeting(meetingCode: string): Promise<void> {
  return request(`/meetings/${meetingCode}`, { method: "DELETE" });
}

/** POST /api/meetings/{code}/start: the host starts a scheduled meeting or personal room. */
export function startMeeting(meetingCode: string): Promise<MeetingDetail> {
  return sendJson("POST", `/meetings/${meetingCode}/start`);
}

/** POST /api/meetings/{code}/end: the host ends the meeting for everyone. */
export function endMeeting(meetingCode: string): Promise<MeetingDetail> {
  return sendJson("POST", `/meetings/${meetingCode}/end`);
}

/** GET /api/meetings/resolve?q=...: "can I join this?" for an ID or any invite link. */
export function resolveJoinInput(rawInput: string): Promise<ResolveResult> {
  return request(`/meetings/resolve?q=${encodeURIComponent(rawInput)}`);
}

/**
 * POST /api/meetings/{code}/participants: join. Creates a join session and returns the
 * secret session token the meeting room needs.
 */
export function joinMeeting(
  meetingCode: string,
  input: JoinMeetingInput,
): Promise<JoinMeetingResult> {
  return sendJson("POST", `/meetings/${meetingCode}/participants`, input);
}

/** GET /api/meetings/{code}/summary: the post-meeting recap. */
export function getMeetingSummary(meetingCode: string): Promise<MeetingSummary> {
  return request(`/meetings/${meetingCode}/summary`);
}

/** GET /api/meetings/{code}/messages: public chat history for the current session. */
export function getChatHistory(meetingCode: string): Promise<ChatMessage[]> {
  return request(`/meetings/${meetingCode}/messages`);
}

/**
 * URL of the .ics download. Used as a plain link (<a href download>), not fetched,
 * because the browser handles the file download itself.
 */
export function calendarFileUrl(meetingCode: string): string {
  return `${API_URL}/api/meetings/${meetingCode}/ics`;
}
