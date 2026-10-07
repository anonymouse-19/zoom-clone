/**
 * Measuring how loud an audio track is, with the Web Audio API.
 *
 * How it works:
 * 1. Wrap the track in a MediaStreamAudioSourceNode.
 * 2. Connect it to an AnalyserNode, which exposes the latest chunk of audio samples.
 * 3. On each read, compute the samples' RMS (root mean square): the standard measure
 *    of "how much energy is in this sound".
 *
 * The analyser is *not* connected to the speakers: we only measure and never play the
 * sound, so there's no echo.
 *
 * Called by: hooks/useMicLevel.ts (the pre-join meter) and hooks/useIsSpeaking.ts (the
 * meeting room's "speaking" outline and speaker view).
 */

// Samples per analysis window. 512 at 48 kHz ≈ 10 ms of audio: responsive, cheap.
const ANALYSER_WINDOW_SIZE = 512;
// Byte samples are centred on 128 (silence) and range 0–255.
const SAMPLE_MIDPOINT = 128;
// Normal speech has an RMS around 0.05–0.3, so we amplify it to use the whole 0–1 range.
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

export type AudioLevelReader = {
  /** How loud the track is right now, 0 (silence) to 1 (loud). */
  readLevel: () => number;
  /** Release the audio graph. Call it when you stop measuring. */
  stop: () => void;
};

export function startAudioLevelReader(track: MediaStreamTrack): AudioLevelReader {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(new MediaStream([track]));
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = ANALYSER_WINDOW_SIZE;
  source.connect(analyser);
  const samples = new Uint8Array(analyser.fftSize);

  return {
    readLevel: () => {
      analyser.getByteTimeDomainData(samples);
      return rmsLevel(samples);
    },
    stop: () => {
      source.disconnect();
      void audioContext.close();
    },
  };
}
