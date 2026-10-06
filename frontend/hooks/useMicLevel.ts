/**
 * How loud the microphone is right now, from 0 (silence) to 1 (loud), updated every
 * animation frame (~60 times a second).
 *
 * How it works (Web Audio API):
 * 1. Wrap the mic track in a MediaStreamAudioSourceNode.
 * 2. Connect it to an AnalyserNode, which exposes the latest chunk of audio samples.
 * 3. Each frame, read the samples and compute their RMS (root mean square): the
 *    standard measure of "how much energy is in this sound".
 *
 * The analyser is *not* connected to the speakers: we only measure, never play the
 * mic back, so there's no echo.
 *
 * Also used for active-speaker detection in the meeting room (Phase 7).
 */

import { useEffect, useState } from "react";

// Samples per analysis window. 512 at 48 kHz ≈ 10 ms of audio: responsive, cheap.
const ANALYSER_WINDOW_SIZE = 512;
// Byte samples are centred on 128 (silence) and range 0–255.
const SAMPLE_MIDPOINT = 128;
// Normal speech has an RMS around 0.05–0.3, so we amplify it to use the whole meter.
const LEVEL_GAIN = 3;

/** RMS of 8-bit audio samples, scaled to 0–1. */
export function rmsLevel(samples: Uint8Array): number {
  let sumOfSquares = 0;
  for (const sample of samples) {
    const normalized = (sample - SAMPLE_MIDPOINT) / SAMPLE_MIDPOINT; // -1 … 1
    sumOfSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumOfSquares / samples.length);
  return Math.min(1, rms * LEVEL_GAIN);
}

export function useMicLevel(track: MediaStreamTrack | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (track === null) {
      return;
    }
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(new MediaStream([track]));
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = ANALYSER_WINDOW_SIZE;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    let frameId = 0;
    function measure() {
      analyser.getByteTimeDomainData(samples);
      setLevel(rmsLevel(samples));
      frameId = requestAnimationFrame(measure);
    }
    frameId = requestAnimationFrame(measure);

    // Cleanup: stop the loop and release the audio graph when the track changes.
    return () => {
      cancelAnimationFrame(frameId);
      source.disconnect();
      void audioContext.close();
    };
  }, [track]);

  return track === null ? 0 : level;
}
