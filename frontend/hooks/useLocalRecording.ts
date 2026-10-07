/**
 * "Record to this computer" (More menu): records this browser tab (the meeting as you
 * see it) with the meeting's sound and your own microphone, and downloads a .webm file
 * when you stop. Nothing is uploaded: only the person recording gets the file
 * (like Zoom's local recording).
 *
 *   Step 1: ask the browser to capture this tab (getDisplayMedia, preferring this tab).
 *   Step 2: mix the tab's sound (everyone else) with my mic (my own voice isn't played
 *           in the tab) through Web Audio, into one audio track.
 *   Step 3: MediaRecorder records video + that audio in chunks; on stop → one file.
 */

import { useEffect, useRef, useState } from "react";

import { downloadBlob } from "@/lib/download";

type ActiveRecording = {
  recorder: MediaRecorder;
  capture: MediaStream;
  audioContext: AudioContext;
};

export function useLocalRecording(meetingCode: string, microphone: MediaStreamTrack | null) {
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<ActiveRecording | null>(null);

  async function startRecording() {
    // Step 1. `preferCurrentTab` isn't in TypeScript's DOM types yet, so it's added here.
    const options: DisplayMediaStreamOptions & { preferCurrentTab: boolean } = {
      video: true,
      audio: true,
      preferCurrentTab: true,
    };
    let capture: MediaStream;
    try {
      capture = await navigator.mediaDevices.getDisplayMedia(options);
    } catch {
      return; // the person closed the picker
    }

    // Step 2
    const audioContext = new AudioContext();
    const mix = audioContext.createMediaStreamDestination();
    const soundSources = [...capture.getAudioTracks()];
    if (microphone !== null) {
      soundSources.push(microphone);
    }
    for (const track of soundSources) {
      audioContext.createMediaStreamSource(new MediaStream([track])).connect(mix);
    }

    // Step 3
    const recorded = new MediaStream([...capture.getVideoTracks(), ...mix.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(recorded);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      downloadBlob(`meeting-${meetingCode}.webm`, new Blob(chunks, { type: recorder.mimeType }));
    };
    // The browser's own "Stop sharing" bar ends the capture: treat it as Stop recording.
    capture.getVideoTracks()[0]?.addEventListener("ended", stopRecording);
    recorder.start();
    recordingRef.current = { recorder, capture, audioContext };
    setIsRecording(true);
  }

  function stopRecording() {
    const recording = recordingRef.current;
    if (recording === null) {
      return;
    }
    recordingRef.current = null;
    recording.recorder.stop(); // fires onstop → the download
    for (const track of recording.capture.getTracks()) {
      track.stop();
    }
    void recording.audioContext.close();
    setIsRecording(false);
  }

  // Leaving the meeting mid-recording still saves what was recorded.
  useEffect(() => {
    return () => {
      const recording = recordingRef.current;
      if (recording !== null) {
        recording.recorder.stop();
        for (const track of recording.capture.getTracks()) {
          track.stop();
        }
        void recording.audioContext.close();
      }
    };
  }, []);

  return { isRecording, startRecording, stopRecording };
}
