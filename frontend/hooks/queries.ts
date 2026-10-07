/**
 * React Query hooks: the only way components read or change server data.
 *
 * Each `use...` query hook fetches through lib/api.ts and caches the result under a
 * query key. Any component asking for the same key shares one request and one cached
 * copy. Mutation hooks (start, cancel, ...) call the API, then *invalidate* the affected
 * keys, so every list showing that data refetches and stays correct.
 *
 * Called by: dashboard, meetings and (later) join/room components.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "@/lib/api";
import { getAuthToken } from "@/lib/authToken";

// Upcoming lists refresh every minute, so "starting soon" states don't go stale while the
// dashboard sits open.
const UPCOMING_REFRESH_MS = 60_000;
const UNAUTHORIZED = 401;
// While a guest waits for the host, ask the server again this often. A WebSocket push
// would be instant, but polling a cheap endpoint every few seconds is simpler, and the
// guest isn't in the meeting's WebSocket room yet.
const WAITING_FOR_HOST_POLL_MS = 4000;

/** Every cache key in one place, so invalidation can't miss a typo'd key. */
export const queryKeys = {
  me: ["me"] as const,
  // A prefix shared by every meeting list, so one invalidation refreshes them all.
  allMeetingLists: ["meetings"] as const,
  meetings: (scope: api.MeetingScope) => ["meetings", scope] as const,
  meeting: (meetingCode: string) => ["meeting", meetingCode] as const,
  resolve: (joinInput: string) => ["resolve", joinInput] as const,
  summary: (meetingCode: string) => ["summary", meetingCode] as const,
};

/**
 * The signed-in user, or `null` for a guest (no token, or the server refused it).
 * `undefined` only while it's loading. Logging in or out replaces it (hooks/useAuth.ts).
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchCurrentUser,
    // Who is signed in only changes by logging in or out, which update this directly.
    staleTime: Infinity,
  });
}

async function fetchCurrentUser(): Promise<api.User | null> {
  if (getAuthToken() === null) {
    return null; // not signed in: no need to ask the server
  }
  try {
    return await api.getMe();
  } catch (error) {
    if (error instanceof api.ApiError && error.status === UNAUTHORIZED) {
      return null; // the token was refused (and lib/api.ts has already forgotten it)
    }
    throw error;
  }
}

export function useMeetings(scope: api.MeetingScope) {
  return useQuery({
    queryKey: queryKeys.meetings(scope),
    queryFn: () => api.listMeetings(scope),
    refetchInterval: scope === "upcoming" ? UPCOMING_REFRESH_MS : false,
  });
}

/**
 * One meeting's details. `isEnabled: false` skips fetching (e.g. Schedule in "new" mode).
 * `joinTicket`: a guest's proof of being in the meeting (the room passes it).
 */
export function useMeeting(meetingCode: string, isEnabled = true, joinTicket?: string) {
  return useQuery({
    queryKey: queryKeys.meeting(meetingCode),
    queryFn: () => api.getMeeting(meetingCode, joinTicket),
    enabled: isEnabled,
  });
}

/** The post-meeting recap: attendance and chat (GET /api/meetings/{code}/summary). */
export function useMeetingSummary(meetingCode: string, joinTicket?: string) {
  return useQuery({
    queryKey: queryKeys.summary(meetingCode),
    queryFn: () => api.getMeetingSummary(meetingCode, joinTicket),
  });
}

/**
 * "Can I join this?" for an ID or link. Keeps asking while the answer is "waiting for
 * host", so the pre-join screen notices the moment the host starts.
 */
export function useResolvedJoinInput(joinInput: string) {
  return useQuery({
    queryKey: queryKeys.resolve(joinInput),
    queryFn: () => api.resolveJoinInput(joinInput),
    refetchInterval: (query) =>
      query.state.data?.state === "waiting_for_host" ? WAITING_FOR_HOST_POLL_MS : false,
  });
}

/** The guest door: POST /api/meetings/{code}/participants. */
export function useJoinMeeting() {
  return useMutation({
    mutationFn: ({ meetingCode, input }: { meetingCode: string; input: api.JoinMeetingInput }) =>
      api.joinMeeting(meetingCode, input),
  });
}

/**
 * After any change to a meeting, refresh the lists and that meeting's details.
 * INTERVIEW: invalidation is how a delete on one page updates every other list.
 */
function useInvalidateMeeting() {
  const queryClient = useQueryClient();
  return (meetingCode: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.allMeetingLists });
    void queryClient.invalidateQueries({ queryKey: queryKeys.meeting(meetingCode) });
  };
}

export function useCreateInstantMeeting() {
  const invalidateMeeting = useInvalidateMeeting();
  return useMutation({
    mutationFn: api.createInstantMeeting,
    onSuccess: (meeting) => invalidateMeeting(meeting.meeting_code),
  });
}

export function useScheduleMeeting() {
  const invalidateMeeting = useInvalidateMeeting();
  return useMutation({
    mutationFn: api.scheduleMeeting,
    onSuccess: (meeting) => invalidateMeeting(meeting.meeting_code),
  });
}

export function useUpdateMeeting() {
  const invalidateMeeting = useInvalidateMeeting();
  return useMutation({
    mutationFn: ({
      meetingCode,
      changes,
    }: {
      meetingCode: string;
      changes: api.UpdateMeetingInput;
    }) => api.updateMeeting(meetingCode, changes),
    onSuccess: (meeting) => invalidateMeeting(meeting.meeting_code),
  });
}

export function useCancelMeeting() {
  const invalidateMeeting = useInvalidateMeeting();
  return useMutation({
    mutationFn: api.cancelMeeting,
    onSuccess: (_nothing, meetingCode) => invalidateMeeting(meetingCode),
  });
}
