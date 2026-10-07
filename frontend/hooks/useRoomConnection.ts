/**
 * Keeps this tab connected to the meeting room while the room screen is showing.
 *
 * Creates a RoomConnection (lib/roomConnection.ts) for the join ticket, gives it the
 * latest camera / microphone / screen tracks, and closes it when the screen goes away.
 * Room state itself is read from stores/roomStore.ts; this hook only returns actions.
 */

import { useEffect, useRef } from "react";

import type { MeetingSession } from "@/lib/meetingSession";
import { RoomConnection, type LocalTracks } from "@/lib/roomConnection";
import type { ClientMessage } from "@/lib/roomProtocol";
import { useRoomStore } from "@/stores/roomStore";

export function useRoomConnection(session: MeetingSession, localTracks: LocalTracks) {
  const connectionRef = useRef<RoomConnection | null>(null);

  useEffect(() => {
    // Start from a clean room, with the mic/camera/device choices made before joining.
    useRoomStore.getState().reset({
      isMicOn: session.isMicOn,
      isCameraOn: session.isCameraOn,
      cameraId: session.cameraId,
      microphoneId: session.microphoneId,
      speakerId: session.speakerId,
    });
    const connection = new RoomConnection(session);
    connectionRef.current = connection;
    // INTERVIEW: in development, React mounts every component, unmounts it, and mounts
    // it again straight away, to expose missing cleanups. Opening the socket on the
    // next tick means that throwaway first mount never connects, so nobody sees this
    // person join and leave in a blink.
    const openTimer = setTimeout(() => connection.open(), 0);
    return () => {
      clearTimeout(openTimer);
      connection.close();
      connectionRef.current = null;
    };
  }, [session]);

  // Declared after the effect above, so on mount it runs after the connection exists.
  const { audio, camera, screen } = localTracks;
  useEffect(() => {
    connectionRef.current?.setLocalTracks({ audio, camera, screen });
  }, [audio, camera, screen]);

  return {
    /** Any message, e.g. a chat line or a host control. */
    send: (message: ClientMessage) => connectionRef.current?.send(message),
    leave: () => connectionRef.current?.leave(),
    startScreenShare: () => connectionRef.current?.startScreenShare(),
  };
}

export type RoomActions = ReturnType<typeof useRoomConnection>;
