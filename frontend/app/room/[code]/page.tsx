/**
 * "/room/{code}": the meeting room.
 *
 * The room only works in a browser: it needs the camera, WebRTC, and this tab's join
 * ticket in sessionStorage. So it's loaded with `ssr: false`, which means the server never
 * renders it and there's no server HTML for the browser's first render to disagree with.
 */

"use client";

import dynamic from "next/dynamic";
import { use } from "react";

const MeetingRoom = dynamic(
  () => import("@/components/meeting/MeetingRoom").then((module) => module.MeetingRoom),
  { ssr: false, loading: () => <div className="h-dvh bg-room" /> },
);

export default function MeetingRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <MeetingRoom meetingCode={code} />;
}
